import type { ComponentInstance } from '../frameworks/types'
import type { SerializedRegistryInstance, RegistryDiff } from '../shared-types'
import { getDevToolsClientContext } from '@vitejs/devtools-kit/client'
import {
  setComponentRegistry,
  showContextMenu,
  hideContextMenu,
  drawAllHighlights,
  createOverlayDOM,
  removeOverlayDOM,
  setClickThroughDOM,
  updateInstanceRects,
  pushSelectedComponentRPC,
  selectComponentById,
} from './overlay'
import {
  setRegistryRef,
  scrollToComponent,
  showCoverageHighlights,
  showBatchCoverageHighlights,
  clearCoverageHighlights,
} from './coverage-actions'
import { isCurrentlyRecording } from './interaction-recorder'
import { warn } from './logger'
import {
  createHighlightActor,
  getHighlightActor,
  isOverlayActive,
  isClickThrough,
} from './highlight-machine'

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

// Component registry
const componentRegistry = new Map<string, ComponentInstance>()

export function getComponentRegistry(): Map<string, ComponentInstance> {
  return componentRegistry
}

// ─── Incremental registry sync to server ─────────────────────────────

const pendingDiff: RegistryDiff = { added: [], removed: [], updated: [] }
let diffFlushTimer: ReturnType<typeof setTimeout> | null = null
let rpcCallFn:
  | ((method: string, ...args: unknown[]) => Promise<unknown>)
  | null = null

export function setRegistryRpcCall(
  fn: (method: string, ...args: unknown[]) => Promise<unknown>,
) {
  if (rpcCallFn) return
  rpcCallFn = fn
  pushFullRegistry()
}

async function setRegistryRpcCallWhenTrusted(
  ctx: NonNullable<ReturnType<typeof getDevToolsClientContext>>,
) {
  if (rpcCallFn) return
  try {
    await ctx.rpc.ensureTrusted()
  } catch {
    return
  }
  setRegistryRpcCall(async (method: string, ...args: unknown[]) => {
    return (ctx.rpc.call as any)(method, ...args)
  })
}

function pushFullRegistry() {
  if (!rpcCallFn || componentRegistry.size === 0) return

  pendingDiff.added = []
  pendingDiff.removed = []
  pendingDiff.updated = []
  if (diffFlushTimer) {
    clearTimeout(diffFlushTimer)
    diffFlushTimer = null
  }

  const added: SerializedRegistryInstance[] = []
  for (const instance of componentRegistry.values()) {
    added.push(serializeInstance(instance))
  }
  rpcCallFn('component-highlighter:push-registry-diff', {
    added,
    removed: [],
    updated: [],
    fullSync: true,
  }).catch(() => {})
}

/**
 * Auto-initialize RPC: registry sync + client broadcast handlers.
 */
let rpcHandlersRegistered = false

function autoInitRpc() {
  if (rpcCallFn && rpcHandlersRegistered) return

  let attempts = 0
  const tryInit = () => {
    attempts++
    const ctx = getDevToolsClientContext()
    if (ctx?.rpc?.call) {
      if (!rpcCallFn) {
        setRegistryRpcCallWhenTrusted(ctx)
      }

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
            handler: (
              data: { componentName: string; hasStory: boolean } | null,
            ) => {
              if (data) {
                showCoverageHighlights(data.componentName, data.hasStory)
              } else {
                clearCoverageHighlights()
              }
            },
          } as any)

          ctx.rpc.client.register({
            name: 'component-highlighter:do-highlight-coverage-batch',
            type: 'action',
            handler: (
              data: Array<{ componentName: string; hasStory: boolean }>,
            ) => {
              showBatchCoverageHighlights(data)
            },
          } as any)

          ctx.rpc.client.register({
            name: 'component-highlighter:do-set-highlight-mode',
            type: 'action',
            handler: (data: { enabled: boolean; toggle?: boolean }) => {
              const actor = getHighlightActor()
              const ctx = actor.getSnapshot().context
              if (data.toggle) {
                if (ctx.mode === 'dock' || ctx.dockWasActive) {
                  actor.send({ type: 'DOCK_DEACTIVATE' })
                } else {
                  actor.send({ type: 'DOCK_ACTIVATE' })
                }
              } else if (data.enabled) {
                actor.send({ type: 'DOCK_ACTIVATE' })
              } else {
                actor.send({ type: 'DOCK_DEACTIVATE' })
              }
            },
          } as any)

          ctx.rpc.client.register({
            name: 'component-highlighter:do-open-url',
            type: 'action',
            handler: (data: { url: string }) => {
              window.open(data.url, '_blank')
            },
          } as any)

          ctx.rpc.client.register({
            name: 'component-highlighter:do-open-panel-tab',
            type: 'action',
            handler: (_data: { tab: string }) => {
              const clientCtx = getDevToolsClientContext() as any
              clientCtx?.docks?.switchEntry?.('storybook-devtools-panel')
            },
          } as any)
        } catch {
          // Client RPC registration not supported
        }
      }

      // Subscribe to highlighter-tab-active shared state
      if (ctx.rpc.sharedState) {
        ctx.rpc.sharedState
          .get('component-highlighter:highlighter-tab-active')
          .then((state: any) => {
            const actor = getHighlightActor()
            const handleTabChange = (active: boolean) => {
              const wasActive =
                actor.getSnapshot().context.mode === 'panel'
              if (active && !wasActive) {
                actor.send({ type: 'PANEL_HIGHLIGHTER_ACTIVATE' })
              } else if (!active && wasActive) {
                actor.send({ type: 'PANEL_HIGHLIGHTER_DEACTIVATE' })
              }
            }
            handleTabChange(!!state.value())
            state.on('updated', (val: any) => handleTabChange(!!val))
          })
          .catch(() => {})
      }

      return
    }
    if (attempts < 60) {
      setTimeout(tryInit, 500)
    }
  }
  setTimeout(tryInit, 500)
}

function serializeInstance(
  instance: ComponentInstance,
): SerializedRegistryInstance {
  const result: SerializedRegistryInstance = {
    id: instance.id,
    meta: { ...instance.meta },
    props: instance.props,
    isConnected: instance.element?.isConnected ?? false,
  }
  if (instance.serializedProps !== undefined) {
    result.serializedProps = instance.serializedProps
  }
  return result
}

function scheduleRegistryPush() {
  if (diffFlushTimer) clearTimeout(diffFlushTimer)
  diffFlushTimer = setTimeout(flushRegistryDiff, 500)
}

function flushRegistryDiff() {
  diffFlushTimer = null
  if (!rpcCallFn) return
  if (
    pendingDiff.added.length === 0 &&
    pendingDiff.removed.length === 0 &&
    pendingDiff.updated.length === 0
  )
    return

  pendingDiff.added = []
  pendingDiff.removed = []
  pendingDiff.updated = []

  const added: SerializedRegistryInstance[] = []
  for (const instance of componentRegistry.values()) {
    added.push(serializeInstance(instance))
  }

  rpcCallFn('component-highlighter:push-registry-diff', {
    added,
    removed: [],
    updated: [],
    fullSync: true,
  }).catch(() => {})
}

// ─── Debounce ────────────────────────────────────────────────────────

function debounce(func: Function, wait: number) {
  let timeout: ReturnType<typeof setTimeout> | undefined
  return (...args: unknown[]) => {
    if (timeout) clearTimeout(timeout)
    timeout = setTimeout(() => func.apply(null, args), wait)
  }
}

// ─── Component finding ──────────────────────────────────────────────

function findComponentAtPoint(x: number, y: number): ComponentInstance | null {
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

  let currentElement: Element | null = elementAtPoint

  while (currentElement) {
    for (const instance of componentRegistry.values()) {
      if (instance.element === currentElement && instance.element.isConnected) {
        return instance
      }
    }
    currentElement = currentElement.parentElement
  }

  return null
}

// ─── Event handlers (send machine events) ────────────────────────────

const handleMouseMove = debounce((event: MouseEvent) => {
  const actor = getHighlightActor()
  if (!isOverlayActive(actor)) return
  if (isCurrentlyRecording()) return

  updateInstanceRects()

  const instance = findComponentAtPoint(event.clientX, event.clientY)
  actor.send({ type: 'HOVER', componentId: instance?.id || null })

  if (instance) {
    instance.rect = instance.element.getBoundingClientRect()
  }
}, 16)

function handleKeyDown(event: KeyboardEvent) {
  if (isCurrentlyRecording()) return

  const actor = getHighlightActor()
  if (!isOverlayActive(actor)) return

  if (event.key === 'Alt') {
    event.preventDefault()
    actor.send({ type: 'TOGGLE_CLICK_THROUGH' })
    return
  }

  if (event.key === 'Escape') {
    actor.send({ type: 'ESCAPE' })
    return
  }
}

// ─── RPC sync helpers ────────────────────────────────────────────────

function syncHighlightState(active: boolean) {
  if (!rpcCallFn) return
  const ctx = getDevToolsClientContext()
  if (!ctx?.rpc?.sharedState) return
  ctx.rpc.sharedState
    .get('component-highlighter:highlight-active')
    .then((state: any) => state.mutate(() => active))
    .catch(() => {})
}

function syncHighlighterTabActive(active: boolean) {
  if (!rpcCallFn) return
  const ctx = getDevToolsClientContext()
  if (!ctx?.rpc?.sharedState) return
  ctx.rpc.sharedState
    .get('component-highlighter:highlighter-tab-active')
    .then((state: any) => state.mutate(() => active))
    .catch(() => {})
}

function notifyClickThrough(enabled: boolean) {
  if (!rpcCallFn) return
  const message = enabled
    ? 'Click-through enabled — press Alt to disable'
    : 'Click-through disabled'
  rpcCallFn('component-highlighter:notify', { message, level: 'info' }).catch(
    () => {},
  )
}

// ─── Machine action callback for highlight clicks ────────────────────

function handleHighlightClick(instance: ComponentInstance, e: MouseEvent) {
  const actor = getHighlightActor()
  actor.send({
    type: 'SELECT_COMPONENT',
    component: instance,
    x: e.clientX,
    y: e.clientY,
  })
}

// ─── Initialize ──────────────────────────────────────────────────────

function initialize() {
  if (typeof window === 'undefined') return
  if (window.__componentHighlighterInitialized) {
    warn('Already initialized, skipping duplicate initialization')
    return
  }

  window.__componentHighlighterInitialized = true

  setComponentRegistry(componentRegistry)
  setRegistryRef(componentRegistry)

  // Create the machine actor with real side-effect actions
  const actor = createHighlightActor({
    createOverlayDOM: () => {
      createOverlayDOM()
      document.body.style.cursor = 'crosshair'
    },
    removeOverlayDOM: () => {
      removeOverlayDOM()
      document.body.style.cursor = ''
    },
    drawHighlights: ({ context }: { context: any }) => {
      drawAllHighlights(
        context.hoveredComponentId,
        context.selectedComponentId,
        isClickThrough(actor),
        handleHighlightClick,
      )
    },
    showContextMenu: ({ context }: { context: any }) => {
      if (!context.selectedComponent) return
      showContextMenu(
        context.selectedComponent,
        context.selectX,
        context.selectY,
        () => actor.send({ type: 'CONTEXT_MENU_CLOSED' }),
      )
    },
    hideContextMenu: () => hideContextMenu(),
    pushSelectedComponent: ({ context }: { context: any }) => {
      pushSelectedComponentRPC(context.selectedComponent)
    },
    clearSelectedComponentRPC: () => {
      pushSelectedComponentRPC(null)
    },
    syncHighlightActiveRPC: ({ context }: { context: any }) => {
      syncHighlightState(context.mode === 'dock' || context.dockWasActive)
    },
    syncHighlighterTabInactiveRPC: () => {
      syncHighlighterTabActive(false)
    },
    enableClickThroughDOM: () => {
      setClickThroughDOM(true)
      document.body.style.cursor = ''
    },
    disableClickThroughDOM: () => {
      setClickThroughDOM(false)
      if (isOverlayActive(actor)) {
        document.body.style.cursor = 'crosshair'
      }
    },
    notifyClickThrough: () => {
      notifyClickThrough(isClickThrough(actor))
    },
    deactivateDock: () => {
      const deactivate = (window as any).__componentHighlighterDeactivateDock
      if (typeof deactivate === 'function') {
        deactivate()
      } else {
        actor.send({ type: 'DOCK_DEACTIVATE' })
      }
    },
    suspendForRecording: () => {
      removeOverlayDOM()
      document.body.style.cursor = ''
    },
    resumeAfterRecording: () => {
      createOverlayDOM()
      document.body.style.cursor = 'crosshair'
      const ctx = actor.getSnapshot().context
      drawAllHighlights(
        ctx.hoveredComponentId,
        ctx.selectedComponentId,
        isClickThrough(actor),
        handleHighlightClick,
      )
    },
  })

  // Expose machine send for overlay.ts (recording flow)
  ;(window as any).__highlightMachineSend = (event: any) => actor.send(event)

  // Event listeners for registry synchronization
  window.addEventListener('component-highlighter:register', ((
    event: CustomEvent,
  ) => {
    const instance = event.detail
    componentRegistry.set(instance.id, instance)
    pendingDiff.added.push(serializeInstance(instance))
    scheduleRegistryPush()
  }) as EventListener)

  window.addEventListener('component-highlighter:unregister', ((
    event: CustomEvent,
  ) => {
    const id = event.detail
    componentRegistry.delete(id)
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
      pendingDiff.updated.push(serializeInstance(instance))
      scheduleRegistryPush()
    }
  }) as EventListener)

  // DOM event listeners
  document.addEventListener('mousemove', handleMouseMove)
  document.addEventListener('keydown', handleKeyDown)

  window.addEventListener(
    'scroll',
    () => {
      if (isOverlayActive(actor)) {
        updateInstanceRects()
        const ctx = actor.getSnapshot().context
        drawAllHighlights(
          ctx.hoveredComponentId,
          ctx.selectedComponentId,
          isClickThrough(actor),
          handleHighlightClick,
        )
      }
    },
    { passive: true },
  )

  // Export for debugging and E2E testing
  window.__componentHighlighterRegistry = componentRegistry

  ;(
    window as unknown as { __componentHighlighterEnable?: () => void }
  ).__componentHighlighterEnable = () => {
    actor.send({ type: 'DOCK_ACTIVATE' })
  }
  ;(
    window as unknown as { __componentHighlighterDisable?: () => void }
  ).__componentHighlighterDisable = () => {
    actor.send({ type: 'DOCK_DEACTIVATE' })
  }
  ;(
    window as unknown as { __componentHighlighterIsActive?: () => boolean }
  ).__componentHighlighterIsActive = () => {
    return actor.getSnapshot().context.mode !== 'inactive'
  }
  ;(
    window as unknown as {
      __componentHighlighterSelectById?: (id: string) => boolean
    }
  ).__componentHighlighterSelectById = (id: string) =>
    selectComponentById(id, (inst, x, y) => {
      actor.send({ type: 'SELECT_COMPONENT', component: inst, x, y })
    })

  // Test hooks for panel highlighter state simulation
  ;(
    window as unknown as {
      __componentHighlighterSetPanelActive?: (active: boolean) => void
    }
  ).__componentHighlighterSetPanelActive = (active: boolean) => {
    if (active) {
      actor.send({ type: 'PANEL_HIGHLIGHTER_ACTIVATE' })
    } else {
      actor.send({ type: 'PANEL_HIGHLIGHTER_DEACTIVATE' })
    }
  }
  ;(
    window as unknown as {
      __componentHighlighterIsDockActive?: () => boolean
    }
  ).__componentHighlighterIsDockActive = () => {
    const ctx = actor.getSnapshot().context
    return ctx.mode === 'dock' || ctx.dockWasActive
  }
  ;(
    window as unknown as {
      __componentHighlighterIsPanelActive?: () => boolean
    }
  ).__componentHighlighterIsPanelActive = () =>
    actor.getSnapshot().context.mode === 'panel'

  // Start auto-initialization of RPC
  autoInitRpc()
}

// ─── Exports for vite-devtools.ts ────────────────────────────────────

export function enableHighlightMode() {
  getHighlightActor().send({ type: 'DOCK_ACTIVATE' })
}

export function disableHighlightMode() {
  getHighlightActor().send({ type: 'DOCK_DEACTIVATE' })
}

// Run initialization
initialize()
