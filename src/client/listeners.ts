import type { ComponentInstance } from '../frameworks/types'
import type { SerializedRegistryInstance, RegistryDiff } from '../shared-types'
import { getDevToolsClientContext } from '@vitejs/devtools-kit/client'
import {
  enableOverlay,
  disableOverlay,
  updateHover,
  updateInstanceRects,
  setComponentRegistry,
  showHoverMenu,
  hideHoverMenu,
  hasSelection,
  clearSelection,
  setClickThrough,
  isClickThroughEnabled,
  selectComponentById,
} from './overlay'
import {
  setRegistryRef,
  scrollToComponent,
  showCoverageHighlights,
  clearCoverageHighlights,
} from './coverage-actions'
import { isCurrentlyRecording } from './interaction-recorder'
import { warn } from './logger'

// Type declarations for globals
declare global {
  interface Window {
    __componentHighlighterRegistry?: Map<string, ComponentInstance>
    __componentHighlighterInitialized?: boolean
    __componentHighlighterEnable?: () => void
    __componentHighlighterDisable?: () => void
    __componentHighlighterIsActive?: () => boolean
  }
}

// Component registry - maintained locally and synced via events
const componentRegistry = new Map<string, ComponentInstance>()

// Export getter for use by other client modules
export function getComponentRegistry(): Map<string, ComponentInstance> {
  return componentRegistry
}

// ─── Incremental registry sync to server ─────────────────────────────

// Pending diff accumulator
const pendingDiff: RegistryDiff = { added: [], removed: [], updated: [] }
let diffFlushTimer: ReturnType<typeof setTimeout> | null = null
let rpcCallFn: ((method: string, ...args: unknown[]) => Promise<unknown>) | null = null

/** Set the RPC call function (injected by vite-devtools.ts after ctx is available) */
export function setRegistryRpcCall(fn: (method: string, ...args: unknown[]) => Promise<unknown>) {
  if (rpcCallFn) return // already initialized
  rpcCallFn = fn
  pushFullRegistry()
}

/** Push the full registry as an initial sync */
function pushFullRegistry() {
  if (!rpcCallFn || componentRegistry.size === 0) return
  const added: SerializedRegistryInstance[] = []
  for (const instance of componentRegistry.values()) {
    added.push(serializeInstance(instance))
  }
  rpcCallFn('component-highlighter:push-registry-diff', { added, removed: [], updated: [] }).catch(() => {})
}

/**
 * Auto-initialize RPC: registry sync + client broadcast handlers.
 * Polls for the DevTools client context so everything works before dock activation.
 */
let rpcHandlersRegistered = false

function autoInitRpc() {
  if (rpcCallFn && rpcHandlersRegistered) return

  let attempts = 0
  const tryInit = () => {
    attempts++
    const ctx = getDevToolsClientContext()
    if (ctx?.rpc?.call) {
      // Initialize registry sync
      if (!rpcCallFn) {
        setRegistryRpcCall(async (method: string, ...args: unknown[]) => {
          return (ctx.rpc.call as any)(method, ...args)
        })
      }

      // Register client broadcast handlers (once)
      if (!rpcHandlersRegistered && ctx.rpc.client) {
        rpcHandlersRegistered = true
        try {
          ctx.rpc.client.register({
            name: 'component-highlighter:do-scroll-to-component',
            type: 'action',
            handler: (data: { componentName: string }) => {
              scrollToComponent(data.componentName)
            },
          } as any)

          ctx.rpc.client.register({
            name: 'component-highlighter:do-highlight-coverage',
            type: 'action',
            handler: (data: { componentName: string; hasStory: boolean } | null) => {
              if (data) {
                showCoverageHighlights(data.componentName, data.hasStory)
              } else {
                clearCoverageHighlights()
              }
            },
          } as any)

          ctx.rpc.client.register({
            name: 'component-highlighter:do-set-highlight-mode',
            type: 'action',
            handler: (data: { enabled: boolean }) => {
              if (data.enabled) {
                enableHighlightMode()
              } else {
                disableHighlightMode()
              }
            },
          } as any)
        } catch {
          // Client RPC registration not supported
        }
      }
      return
    }
    // Retry for up to 30 seconds
    if (attempts < 60) {
      setTimeout(tryInit, 500)
    }
  }
  setTimeout(tryInit, 500)
}

function serializeInstance(instance: ComponentInstance): SerializedRegistryInstance {
  return {
    id: instance.id,
    meta: { ...instance.meta },
    props: instance.props,
    serializedProps: instance.serializedProps,
    isConnected: instance.element?.isConnected ?? false,
  }
}

function scheduleRegistryPush() {
  if (diffFlushTimer) clearTimeout(diffFlushTimer)
  diffFlushTimer = setTimeout(flushRegistryDiff, 500)
}

function flushRegistryDiff() {
  diffFlushTimer = null
  if (!rpcCallFn) return
  if (pendingDiff.added.length === 0 && pendingDiff.removed.length === 0 && pendingDiff.updated.length === 0) return

  const diff: RegistryDiff = {
    added: [...pendingDiff.added],
    removed: [...pendingDiff.removed],
    updated: [...pendingDiff.updated],
  }
  pendingDiff.added = []
  pendingDiff.removed = []
  pendingDiff.updated = []

  rpcCallFn('component-highlighter:push-registry-diff', diff).catch(() => {
    // Server may not be ready yet; diffs will be re-pushed on next change
  })
}

// Track if the dock is active (highlight mode)
let isDockActive = false

// Double-Escape to exit highlight mode
let lastEscapeTime = 0
const DOUBLE_ESCAPE_MS = 600

/**
 * Enable highlight mode (called when dock is activated)
 */
export function enableHighlightMode() {
  isDockActive = true
  enableOverlay()
  // TODO: hide/fade the DevTools panel so components beneath it are reachable.
  // Targeting `vite-devtools-dock-embedded` with opacity+pointer-events works
  // technically but the UX isn't great — find a better approach (e.g. slide
  // the panel out, shrink it, or use a dedicated DevTools API if one exists).
}

/**
 * Disable highlight mode (called when dock is deactivated)
 */
export function disableHighlightMode() {
  isDockActive = false
  // Disable click-through if it was active
  if (isClickThroughEnabled()) {
    setClickThrough(false)
  }
  clearSelection()
  disableOverlay()
  hideHoverMenu()
  // TODO: restore the DevTools panel once the approach above is settled.
}

// Debounce function for performance
function debounce(func: Function, wait: number) {
  let timeout: ReturnType<typeof setTimeout> | undefined
  return (...args: unknown[]) => {
    if (timeout) clearTimeout(timeout)
    timeout = setTimeout(() => func.apply(null, args), wait)
  }
}

// Find component at pointer position
function findComponentAtPoint(x: number, y: number): ComponentInstance | null {
  // Temporarily hide the highlight container so elementFromPoint hits the
  // actual app elements. Individual highlight children have pointer-events: auto
  // (for click handling), so they'd intercept the hit test otherwise.
  const highlightContainer = document.getElementById(
    'component-highlighter-container',
  )

  if (highlightContainer) {
    highlightContainer.style.display = 'none'
  }

  const elementAtPoint = document.elementFromPoint(x, y)

  if (highlightContainer) {
    highlightContainer.style.display = ''
  }

  if (!elementAtPoint) return null

  // Walk up the DOM tree from the deepest element to find component instances
  let currentElement: Element | null = elementAtPoint

  while (currentElement) {
    // Check if this element has a component instance
    for (const instance of componentRegistry.values()) {
      if (instance.element === currentElement && instance.element.isConnected) {
        return instance
      }
    }

    // Move up to parent
    currentElement = currentElement.parentElement
  }

  return null
}

// Mouse move handler with debouncing
const handleMouseMove = debounce((event: MouseEvent) => {
  // Only respond when dock is active (highlight mode is on)
  if (!isDockActive) return

  // Never render highlight UI while interactions are being recorded
  if (isCurrentlyRecording()) {
    updateHover(null)
    hideHoverMenu()
    return
  }

  // Update instance rects for all components (for overlay positioning)
  updateInstanceRects()

  // Find component under cursor for hover highlight
  const instance = findComponentAtPoint(event.clientX, event.clientY)
  updateHover(instance?.id || null)

  if (instance) {
    // Update rect for this instance (needed for proper highlight positioning)
    instance.rect = instance.element.getBoundingClientRect()
    showHoverMenu(instance, event.clientX, event.clientY)
  } else {
    hideHoverMenu()
  }
}, 16) // ~60fps

// Keyboard handlers
function handleKeyDown(event: KeyboardEvent) {
  if (isCurrentlyRecording()) return

  // Alt/Option key: toggle click-through mode (press to toggle, not hold)
  // This allows clicking through highlights to interact with the app.
  // Using a toggle avoids modifier+click browser defaults (e.g. Alt+click downloads links).
  if (event.key === 'Alt' && isDockActive) {
    event.preventDefault() // Suppress browser menu bar activation
    const newState = !isClickThroughEnabled()
    setClickThrough(newState)
    notifyClickThrough(newState)
    return
  }

  // Escape handling:
  //   First press  → clear current selection (if any)
  //   Second press within DOUBLE_ESCAPE_MS → exit highlight mode entirely
  //   (the DevTools panel is automatically restored by disableHighlightMode)
  if (event.key === 'Escape' && isDockActive) {
    const now = Date.now()

    if (now - lastEscapeTime < DOUBLE_ESCAPE_MS) {
      // Second Escape — toggle the dock off via the DevTools API so the button
      // state updates correctly. This fires entry:deactivated which in turn
      // calls disableHighlightMode() (overlay off + panel restored).
      lastEscapeTime = 0
      const deactivate = (window as any).__componentHighlighterDeactivateDock
      if (typeof deactivate === 'function') {
        deactivate()
      } else {
        // Fallback if the dock script hasn't registered the function yet
        disableHighlightMode()
      }
    } else {
      // First Escape — record the time and clear any active selection
      lastEscapeTime = now
      if (hasSelection()) {
        clearSelection()
      }
    }
    return
  }
}

/** Notify the user about click-through state change via DevTools toast */
function notifyClickThrough(enabled: boolean) {
  if (!rpcCallFn) return
  const message = enabled
    ? 'Click-through enabled — press Alt to disable'
    : 'Click-through disabled'
  rpcCallFn('component-highlighter:notify', { message, level: 'info' }).catch(() => {})
}

/**
 * Initialize the component highlighter listeners
 * This is called once when the module is loaded
 */
function initialize() {
  // Prevent duplicate initialization if module is loaded multiple times
  if (typeof window === 'undefined') return
  if (window.__componentHighlighterInitialized) {
    warn(
      'Already initialized, skipping duplicate initialization',
    )
    return
  }

  // Mark as initialized
  window.__componentHighlighterInitialized = true

  // Set the registry reference for overlay module and coverage-actions module
  setComponentRegistry(componentRegistry)
  setRegistryRef(componentRegistry)

  // Event listeners for registry synchronization
  window.addEventListener('component-highlighter:register', ((
    event: CustomEvent,
  ) => {
    const instance = event.detail
    componentRegistry.set(instance.id, instance)
    // Track diff for server sync
    pendingDiff.added.push(serializeInstance(instance))
    scheduleRegistryPush()
  }) as EventListener)

  window.addEventListener('component-highlighter:unregister', ((
    event: CustomEvent,
  ) => {
    const id = event.detail
    componentRegistry.delete(id)
    // Track diff for server sync
    pendingDiff.removed.push(id)
    scheduleRegistryPush()
  }) as EventListener)

  window.addEventListener('component-highlighter:update-props', ((
    event: CustomEvent,
  ) => {
    const { id, props, serializedProps } = event.detail
    const instance = componentRegistry.get(id)
    if (instance) {
      instance.props = props
      if (serializedProps) {
        instance.serializedProps = serializedProps
      }
      // Track diff for server sync
      pendingDiff.updated.push(serializeInstance(instance))
      scheduleRegistryPush()
    }
  }) as EventListener)

  // Initialize DOM event listeners
  document.addEventListener('mousemove', handleMouseMove)
  document.addEventListener('keydown', handleKeyDown)

  // Update component positions on scroll
  window.addEventListener(
    'scroll',
    () => {
      if (isDockActive) {
        updateInstanceRects()
      }
    },
    { passive: true },
  )

  // Export for debugging and E2E testing
  window.__componentHighlighterRegistry = componentRegistry

  // Test/automation hook: bypass DevTools dock activation when needed.
  ;(window as unknown as { __componentHighlighterEnable?: () => void }).__componentHighlighterEnable =
    () => {
      enableHighlightMode()
    }
  ;(window as unknown as { __componentHighlighterDisable?: () => void }).__componentHighlighterDisable =
    () => {
      disableHighlightMode()
    }
  ;(window as unknown as { __componentHighlighterIsActive?: () => boolean }).__componentHighlighterIsActive =
    () => isDockActive
  ;(window as unknown as { __componentHighlighterSelectById?: (id: string) => boolean }).__componentHighlighterSelectById =
    (id: string) => selectComponentById(id)

  // Start auto-initialization of RPC (registry sync + broadcast handlers)
  autoInitRpc()
}

// Run initialization
initialize()
