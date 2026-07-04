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

// ─── Live prop editing (shared) ──────────────────────────────────────
//
// Framework-agnostic machinery behind the panel/context-menu prop editor:
// decoding typed edit payloads, immutable path updates, snapshotting pre-edit
// originals for reset, and keeping the registry + serialized props in sync.
// Each framework runtime supplies only `applyOverride` — the one genuinely
// framework-specific step (React: `renderer.overrideProps`; Vue: mutating the
// instance's reactive `props` object).

export type PropPath = Array<string | number>
export type SetPropPayload = { kind: string; text: string }
export type PropEditResult = { ok: boolean; error?: string }

export interface LivePropEditor {
  /** Decode `payload` and apply it at `path` on the live instance. */
  setProp: (id: string, path: PropPath, payload: SetPropPayload) => PropEditResult
  /** Revert a previously-edited path to its original (pre-edit) value. */
  resetProp: (id: string, path: PropPath) => PropEditResult
  /** Top-level prop keys whose current value differs from its original. */
  getEditedProps: (id: string) => string[]
  /** Drop original-value snapshots for an unmounted instance. */
  forgetInstance: (id: string) => void
}

/** Immutably set `value` at `path` within `obj`, cloning along the path. */
export function setAtPath(
  obj: Record<string, unknown>,
  path: PropPath,
  value: unknown,
): Record<string, unknown> {
  if (path.length === 0) return obj
  const [head, ...rest] = path
  const base: any = Array.isArray(obj) ? [...(obj as any)] : { ...obj }
  if (rest.length === 0) {
    base[head as any] = value
  } else {
    const child = base[head as any]
    base[head as any] = setAtPath(
      child && typeof child === 'object' ? child : {},
      rest,
      value,
    )
  }
  return base
}

/** Read the value at `path` within `obj` (undefined if any segment is missing). */
export function getAtPath(obj: unknown, path: PropPath): unknown {
  let cur: any = obj
  for (const key of path) {
    if (cur == null) return undefined
    cur = cur[key as any]
  }
  return cur
}

/** Recursively revive `{__isDate,iso}` markers; reject fn/JSX/slot markers. */
function reviveEdited(value: unknown): unknown {
  if (!value || typeof value !== 'object') return value
  const v = value as Record<string, unknown>
  if (v['__isDate'] && typeof v['iso'] === 'string')
    return new Date(v['iso'] as string)
  if (v['__isJSX'] || v['__isFunction'] || v['__isVueSlot']) {
    throw new Error('functions/JSX cannot be edited')
  }
  if (Array.isArray(value)) return value.map(reviveEdited)
  const out: Record<string, unknown> = {}
  for (const [k, val] of Object.entries(v)) out[k] = reviveEdited(val)
  return out
}

function decodeValue(payload: SetPropPayload): unknown {
  const { kind, text } = payload
  switch (kind) {
    case 'string':
      return text
    case 'number': {
      const n = Number(text)
      if (Number.isNaN(n)) throw new Error(`"${text}" is not a number`)
      return n
    }
    case 'boolean':
      return text === 'true'
    case 'date': {
      const d = new Date(text)
      if (Number.isNaN(d.getTime()))
        throw new Error(`"${text}" is not a valid date`)
      return d
    }
    case 'json':
    default: {
      const trimmed = text.trim()
      if (trimmed === 'undefined') return undefined
      let parsed: unknown
      try {
        parsed = JSON.parse(trimmed)
      } catch (e) {
        throw new Error(`Invalid JSON: ${(e as Error).message}`)
      }
      return reviveEdited(parsed)
    }
  }
}

export function createLivePropEditor(options: {
  /** Look up the live registry record whose props/serializedProps we sync. */
  getInstance: (id: string) =>
    | { props: Record<string, unknown>; serializedProps: Record<string, unknown> }
    | undefined
  /** The framework's story-safe value serializer. */
  serializeValue: (value: unknown) => unknown
  /**
   * Apply the decoded value to the live framework instance. Throws with a
   * user-facing message when the instance is gone or editing is unavailable.
   */
  applyOverride: (id: string, path: PropPath, value: unknown) => void
}): LivePropEditor {
  const { getInstance, serializeValue, applyOverride } = options

  // The first time a path is overridden we snapshot its pre-edit value (raw).
  // It lets the UI offer "reset to original" and detect which props currently
  // differ from their original. Entries persist across further edits (the
  // original stays stable) and are cleared on unmount via forgetInstance.
  const originalProps = new Map<string, Map<string, unknown>>()

  function rememberOriginal(id: string, path: PropPath) {
    const inst = getInstance(id)
    if (!inst) return
    const pathKey = JSON.stringify(path)
    let perInstance = originalProps.get(id)
    if (!perInstance) {
      perInstance = new Map()
      originalProps.set(id, perInstance)
    }
    if (!perInstance.has(pathKey)) {
      perInstance.set(pathKey, getAtPath(inst.props, path))
    }
  }

  /** Two values serialize to the same story-safe shape? */
  function sameSerialized(a: unknown, b: unknown): boolean {
    try {
      return (
        JSON.stringify(serializeValue(a)) === JSON.stringify(serializeValue(b))
      )
    } catch {
      return a === b
    }
  }

  // Synchronously reflect the edit in the registry + serialized props so a
  // story saved right after an edit uses the NEW value. The lazy render-driven
  // serialization (gated by isTrackingActive) is not guaranteed to have run
  // yet — and an explicit user edit is exactly when we *want* to serialize
  // regardless of that gate.
  function syncRegistry(id: string, path: PropPath, value: unknown) {
    const inst = getInstance(id)
    if (!inst) return
    inst.props = setAtPath(inst.props, path, value)
    const serialized: Record<string, unknown> = {}
    for (const [key, v] of Object.entries(inst.props)) {
      serialized[key] = serializeValue(v)
    }
    inst.serializedProps = serialized
    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('component-highlighter:update-props', {
          detail: { id, props: inst.props, serializedProps: serialized },
        }),
      )
    }
  }

  function setProp(
    id: string,
    path: PropPath,
    payload: SetPropPayload,
  ): PropEditResult {
    let value: unknown
    try {
      value = decodeValue(payload)
    } catch (e) {
      return { ok: false, error: (e as Error).message }
    }
    // Snapshot the pre-edit value (once) so the edit is resettable.
    rememberOriginal(id, path)
    try {
      applyOverride(id, path, value)
      syncRegistry(id, path, value)
      return { ok: true }
    } catch (e) {
      return { ok: false, error: (e as Error).message }
    }
  }

  function resetProp(id: string, path: PropPath): PropEditResult {
    const perInstance = originalProps.get(id)
    const pathKey = JSON.stringify(path)
    if (!perInstance || !perInstance.has(pathKey)) {
      return { ok: false, error: 'No original value to reset to' }
    }
    const original = perInstance.get(pathKey)
    try {
      applyOverride(id, path, original)
      syncRegistry(id, path, original)
      return { ok: true }
    } catch (e) {
      return { ok: false, error: (e as Error).message }
    }
  }

  function getEditedProps(id: string): string[] {
    const perInstance = originalProps.get(id)
    const inst = getInstance(id)
    if (!perInstance || !inst) return []
    const edited: string[] = []
    for (const [pathKey, original] of perInstance) {
      let path: PropPath
      try {
        path = JSON.parse(pathKey)
      } catch {
        continue
      }
      // The UI only edits top-level props (path === [key]).
      if (path.length !== 1) continue
      if (!sameSerialized(getAtPath(inst.props, path), original)) {
        edited.push(String(path[0]))
      }
    }
    return edited
  }

  function forgetInstance(id: string) {
    originalProps.delete(id)
  }

  return { setProp, resetProp, getEditedProps, forgetInstance }
}

/**
 * Wire the editor to the window globals the client UI (context menu / panel)
 * drives. `canEdit` answers `__componentHighlighterCanEditProps()`.
 */
export function installLivePropEditGlobals(
  editor: LivePropEditor,
  canEdit: () => boolean,
): void {
  if (typeof window === 'undefined') return
  const w = window as unknown as {
    __componentHighlighterSetProp?: LivePropEditor['setProp']
    __componentHighlighterResetProp?: LivePropEditor['resetProp']
    __componentHighlighterGetEditedProps?: LivePropEditor['getEditedProps']
    __componentHighlighterCanEditProps?: () => boolean
  }
  w.__componentHighlighterSetProp = editor.setProp
  w.__componentHighlighterResetProp = editor.resetProp
  w.__componentHighlighterGetEditedProps = editor.getEditedProps
  w.__componentHighlighterCanEditProps = canEdit
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

