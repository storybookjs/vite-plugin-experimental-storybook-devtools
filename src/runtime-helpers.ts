// ─── Tracking gate ───────────────────────────────────────────────────
//
// Prop serialization (reactElementToJSXString / vnode walking) is the most
// expensive per-component work in dev. It is pointless until a DevTools
// client is actually connected and asking for the registry. The gate stays
// closed (no serialization) until `activateTracking()` is called — this is
// the "zero overhead until DevTools is opened" principle.

let trackingActive = false
const activationCallbacks: Array<() => void> = []

export function isTrackingActive(): boolean {
  return trackingActive
}

/**
 * Register a callback that backfills serialized state once tracking turns on.
 * If tracking is already active the callback runs immediately.
 */
export function onTrackingActivated(cb: () => void): void {
  if (trackingActive) {
    cb()
    return
  }
  activationCallbacks.push(cb)
}

export function activateTracking(): void {
  if (trackingActive) return
  trackingActive = true
  const cbs = activationCallbacks.splice(0)
  for (const cb of cbs) {
    try {
      cb()
    } catch {
      // a single framework's backfill failing must not block the others
    }
  }
}

if (typeof window !== 'undefined') {
  ;(
    window as unknown as { __componentHighlighterActivateTracking?: () => void }
  ).__componentHighlighterActivateTracking = activateTracking
}

// ─── Per-instance serialization coalescer ────────────────────────────
//
// A re-rendering component can fire updateProps dozens of times per frame,
// but only the last value is ever sent. Coalesce per animation frame and
// drop work for instances that died before the frame flushed
// (born-and-died elimination).

type PendingSerialization = {
  run: () => void
  isAlive: () => boolean
}

const pendingSerializations = new Map<string, PendingSerialization>()
let serializationFrameScheduled = false

function flushSerializations() {
  serializationFrameScheduled = false
  const entries = Array.from(pendingSerializations.entries())
  pendingSerializations.clear()
  for (const [, pending] of entries) {
    if (!pending.isAlive()) continue // born and died within the frame — skip
    try {
      pending.run()
    } catch {
      // serialization of one instance must not block the rest
    }
  }
}

function scheduleSerializationFlush() {
  if (serializationFrameScheduled) return
  serializationFrameScheduled = true
  if (typeof requestAnimationFrame === 'function') {
    requestAnimationFrame(flushSerializations)
  } else {
    Promise.resolve().then(flushSerializations)
  }
}

/**
 * Defer the (expensive) serialization + event dispatch for an instance to the
 * next animation frame, collapsing repeated updates within the same frame into
 * a single run. The latest `run` for an id wins.
 */
export function scheduleSerialization(
  id: string,
  run: () => void,
  isAlive: () => boolean,
): void {
  pendingSerializations.set(id, { run, isAlive })
  scheduleSerializationFlush()
}

export function cancelScheduledSerialization(id: string): void {
  pendingSerializations.delete(id)
}

export function findFirstTrackableElement(root: Node | null): Element | null {
  if (!root || root.nodeType !== Node.ELEMENT_NODE) return null

  const rootElement = root as Element
  const rootRect = rootElement as HTMLElement
  if (rootRect.offsetWidth > 0 || rootRect.offsetHeight > 0) {
    return rootElement
  }

  const walker = document.createTreeWalker(
    rootElement,
    NodeFilter.SHOW_ELEMENT,
    {
      acceptNode: (node) => {
        const el = node as HTMLElement
        return el.offsetWidth > 0 || el.offsetHeight > 0
          ? NodeFilter.FILTER_ACCEPT
          : NodeFilter.FILTER_SKIP
      },
    },
  )

  const firstChild = walker.firstChild() as Element | null
  return firstChild || rootElement
}

export function attachRectObservers(
  getInstance: (
    id: string,
  ) => { element?: Element; rect?: DOMRect } | undefined,
  id: string,
  element: Element,
): () => void {
  const updateRect = () => {
    const instance = getInstance(id)
    if (instance?.element && instance.element.isConnected) {
      instance.rect = (instance.element as HTMLElement).getBoundingClientRect()
    }
  }

  const mutation = new MutationObserver(updateRect)
  mutation.observe(element, {
    attributes: true,
    childList: true,
    subtree: true,
    attributeFilter: ['style', 'class'],
  })

  const resize = new ResizeObserver(updateRect)
  resize.observe(element)

  return () => {
    mutation.disconnect()
    resize.disconnect()
  }
}

type TrackingState = {
  id: string | null
  element: Element | null
  disconnect: (() => void) | null
}

type SyncOptions = {
  state: TrackingState
  element: Element
  props: Record<string, unknown>
  register: (element: Element, props: Record<string, unknown>) => string
  unregister: (id: string) => void
  updateProps: (id: string, props: Record<string, unknown>) => void
  getInstance: (id: string) => { element?: Element; rect?: DOMRect } | undefined
}

export function syncInstanceTracking(options: SyncOptions): void {
  const {
    state,
    element,
    props,
    register,
    unregister,
    updateProps,
    getInstance,
  } = options

  if (state.id && state.element === element) {
    updateProps(state.id, props)
    return
  }

  if (state.id) {
    unregister(state.id)
  }

  state.disconnect?.()
  state.disconnect = null

  const id = register(element, props)
  state.id = id
  state.element = element
  state.disconnect = attachRectObservers(getInstance, id, element)
}

export function cleanupInstanceTracking(
  state: TrackingState,
  unregister: (id: string) => void,
): void {
  state.disconnect?.()
  state.disconnect = null

  if (state.id) {
    unregister(state.id)
  }

  state.id = null
  state.element = null
}
