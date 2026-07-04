/**
 * XState v5 state machine for component-highlighter overlay state.
 *
 * Single source of truth for highlight activation, selection, hover,
 * click-through, and recording states. Lives on the client (main page).
 * The panel (iframe) communicates via shared-state / RPC events.
 *
 * Architecture:
 *   - Parallel regions: overlay + clickThrough
 *   - Activation sources (dock, panel) are tracked in context and
 *     the overlay uses `always` transitions to react to changes.
 *   - Side effects (DOM, RPC) are implemented as actions.
 */

import { setup, assign, createActor, type ActorRefFrom } from 'xstate'
import type { ComponentInstance } from '../frameworks/types'

// ─── Context ────────────────────────────────────────────────────────

export type HighlightMode = 'dock' | 'panel' | 'inactive'

export interface HighlightContext {
  hoveredComponentId: string | null
  selectedComponentId: string | null
  selectedComponent: ComponentInstance | null
  selectX: number
  selectY: number
  /** Current highlight mode — dock (context-menu flow), panel (no context menu), or inactive. */
  mode: HighlightMode
  /** Whether the dock was independently activated while panel has priority. */
  dockWasActive: boolean
  lastEscapeTime: number
}

// ─── Events ─────────────────────────────────────────────────────────

export type HighlightEvent =
  | { type: 'DOCK_ACTIVATE' }
  | { type: 'DOCK_DEACTIVATE' }
  | { type: 'PANEL_HIGHLIGHTER_ACTIVATE' }
  | { type: 'PANEL_HIGHLIGHTER_DEACTIVATE' }
  | { type: 'HOVER'; componentId: string | null }
  | {
      type: 'SELECT_COMPONENT'
      component: ComponentInstance
      x: number
      y: number
    }
  | { type: 'CLEAR_SELECTION' }
  | { type: 'CONTEXT_MENU_CLOSED' }
  | { type: 'TOGGLE_CLICK_THROUGH' }
  | { type: 'ESCAPE' }
  | { type: 'START_RECORDING' }
  | { type: 'STOP_RECORDING' }

// ─── Machine ────────────────────────────────────────────────────────

export const highlightMachine = setup({
  types: {
    context: {} as HighlightContext,
    events: {} as HighlightEvent,
  },

  guards: {
    isAnySourceActive: ({ context }) => context.mode !== 'inactive',
    noSourceActive: ({ context }) => context.mode === 'inactive',
    hasSelection: ({ context }) => context.selectedComponentId !== null,
    shouldShowContextMenu: ({ context }) => context.mode !== 'panel',
    isDoubleEscape: ({ context }) => Date.now() - context.lastEscapeTime < 600,
  },

  actions: {
    // ── Mode mutations ──
    activateDockMode: assign({
      mode: 'dock' as const,
      dockWasActive: true,
    }),
    activatePanelMode: assign({ mode: 'panel' as const }),
    activatePanelModeFromEnabled: assign({
      mode: 'panel' as const,
      dockWasActive: ({ context }: { context: HighlightContext }) =>
        context.mode === 'dock' || context.dockWasActive,
    }),
    fallbackToDock: assign({ mode: 'dock' as const }),
    deactivateMode: assign({
      mode: 'inactive' as const,
      dockWasActive: false,
    }),
    markDockBackground: assign({ dockWasActive: true }),
    clearDockBackground: assign({ dockWasActive: false }),
    setHover: assign({
      hoveredComponentId: (
        _,
        params: { componentId: string | null },
      ) => params.componentId,
    }),
    setSelection: assign({
      selectedComponentId: (
        _,
        params: { component: ComponentInstance; x: number; y: number },
      ) => params.component.id,
      selectedComponent: (
        _,
        params: { component: ComponentInstance; x: number; y: number },
      ) => params.component,
      selectX: (
        _,
        params: { component: ComponentInstance; x: number; y: number },
      ) => params.x,
      selectY: (
        _,
        params: { component: ComponentInstance; x: number; y: number },
      ) => params.y,
    }),
    clearSelectionContext: assign({
      selectedComponentId: null,
      selectedComponent: null,
      selectX: 0,
      selectY: 0,
    }),
    clearHover: assign({ hoveredComponentId: null }),
    recordEscapeTime: assign({ lastEscapeTime: () => Date.now() }),
    resetEscapeTime: assign({ lastEscapeTime: 0 }),

    // ── Side-effect stubs (replaced at runtime via machine.provide()) ──
    createOverlayDOM: () => {},
    removeOverlayDOM: () => {},
    drawHighlights: () => {},
    showContextMenu: () => {},
    hideContextMenu: () => {},
    pushSelectedComponent: () => {},
    clearSelectedComponentRPC: () => {},
    syncHighlightActiveRPC: () => {},
    syncHighlighterTabInactiveRPC: () => {},
    enableClickThroughDOM: () => {},
    disableClickThroughDOM: () => {},
    notifyClickThrough: () => {},
    deactivateDock: () => {},
    suspendForRecording: () => {},
    resumeAfterRecording: () => {},
  },
}).createMachine({
  id: 'highlight',
  type: 'parallel',
  context: {
    hoveredComponentId: null,
    selectedComponentId: null,
    selectedComponent: null,
    selectX: 0,
    selectY: 0,
    mode: 'inactive' as const,
    dockWasActive: false,
    lastEscapeTime: 0,
  },

  states: {
    // ════════════════════════════════════════════════════════════════
    // Overlay — the visual highlight layer.
    //
    // Activation sources update context first, then `always` transitions
    // check whether the overlay should enable/disable.
    // ════════════════════════════════════════════════════════════════
    overlay: {
      initial: 'disabled',
      states: {
        disabled: {
          on: {
            DOCK_ACTIVATE: {
              target: 'enabled',
              // Clear any stale selection from a previous panel session
              actions: [
                'activateDockMode',
                'clearSelectionContext',
                'syncHighlightActiveRPC',
              ],
            },
            PANEL_HIGHLIGHTER_ACTIVATE: {
              target: 'enabled',
              actions: ['activatePanelMode'],
            },
          },
        },

        enabled: {
          entry: ['createOverlayDOM'],
          exit: [
            // Only clear transient state (hover) and DOM.
            // Selection is preserved in context so it survives tab switches.
            // Selection is explicitly cleared by DOCK_DEACTIVATE or user actions.
            'clearHover',
            'hideContextMenu',
            'removeOverlayDOM',
          ],
          initial: 'idle',

          // Activation/deactivation from within enabled state
          on: {
            DOCK_ACTIVATE: [
              {
                // Panel has priority — just remember dock is active in background
                guard: ({ context }) => context.mode === 'panel',
                actions: ['markDockBackground', 'syncHighlightActiveRPC'],
              },
              {
                actions: ['activateDockMode', 'syncHighlightActiveRPC'],
              },
            ],
            DOCK_DEACTIVATE: [
              {
                // Panel has priority → stay enabled, just clear dock background
                guard: ({ context }) => context.mode === 'panel',
                actions: [
                  'clearDockBackground',
                  'syncHighlighterTabInactiveRPC',
                  'syncHighlightActiveRPC',
                  'disableClickThroughDOM',
                ],
              },
              {
                // Dock mode, no panel → disable overlay.
                // Dock deactivation is an explicit user action → clear selection.
                target: 'disabled',
                actions: [
                  'deactivateMode',
                  'clearSelectionContext',
                  'clearSelectedComponentRPC',
                  'syncHighlighterTabInactiveRPC',
                  'syncHighlightActiveRPC',
                ],
              },
            ],
            PANEL_HIGHLIGHTER_ACTIVATE: {
              actions: ['activatePanelModeFromEnabled'],
            },
            PANEL_HIGHLIGHTER_DEACTIVATE: [
              {
                // Dock was active in background → fall back to dock mode.
                // Clear selection so clicks go through the context menu flow.
                target: '.idle',
                actions: [
                  'fallbackToDock',
                  'clearSelectionContext',
                  'hideContextMenu',
                  'clearSelectedComponentRPC',
                  'drawHighlights',
                ],
                guard: ({ context }) => context.dockWasActive === true,
              },
              {
                // No dock in background → disable overlay.
                // Preserve selection in context for tab-switch restore.
                target: 'disabled',
                actions: ['deactivateMode'],
              },
            ],
          },

          states: {
            idle: {
              // If there's a stored selection from a panel tab switch, restore it.
              // Only restore when panel is active — not when dock activates
              // after panel close (that should start fresh with context menu).
              always: {
                target: 'selected',
                guard: ({ context }) =>
                  context.selectedComponentId !== null &&
                  context.mode === 'panel',
                actions: ['drawHighlights', 'pushSelectedComponent'],
              },
              on: {
                HOVER: {
                  actions: [
                    {
                      type: 'setHover',
                      params: ({ event }) => ({
                        componentId: event.componentId,
                      }),
                    },
                    'drawHighlights',
                  ],
                },
                SELECT_COMPONENT: [
                  {
                    guard: 'shouldShowContextMenu',
                    target: 'selected',
                    actions: [
                      {
                        type: 'setSelection',
                        params: ({ event }) => ({
                          component: event.component,
                          x: event.x,
                          y: event.y,
                        }),
                      },
                      'drawHighlights',
                      'showContextMenu',
                      'pushSelectedComponent',
                    ],
                  },
                  {
                    // Panel active → select but no context menu
                    target: 'selected',
                    actions: [
                      {
                        type: 'setSelection',
                        params: ({ event }) => ({
                          component: event.component,
                          x: event.x,
                          y: event.y,
                        }),
                      },
                      'drawHighlights',
                      'pushSelectedComponent',
                    ],
                  },
                ],
                ESCAPE: [
                  {
                    guard: 'isDoubleEscape',
                    actions: ['resetEscapeTime', 'deactivateDock'],
                  },
                  { actions: ['recordEscapeTime'] },
                ],
                START_RECORDING: { target: 'recording' },
              },
            },

            selected: {
              on: {
                HOVER: {
                  actions: [
                    {
                      type: 'setHover',
                      params: ({ event }) => ({
                        componentId: event.componentId,
                      }),
                    },
                    'drawHighlights',
                  ],
                },
                CLEAR_SELECTION: {
                  target: 'idle',
                  actions: [
                    'clearSelectionContext',
                    'hideContextMenu',
                    'clearSelectedComponentRPC',
                    'drawHighlights',
                  ],
                },
                CONTEXT_MENU_CLOSED: {
                  target: 'idle',
                  actions: [
                    'clearSelectionContext',
                    'clearSelectedComponentRPC',
                    'drawHighlights',
                  ],
                },
                SELECT_COMPONENT: [
                  {
                    guard: 'shouldShowContextMenu',
                    actions: [
                      'hideContextMenu',
                      {
                        type: 'setSelection',
                        params: ({ event }) => ({
                          component: event.component,
                          x: event.x,
                          y: event.y,
                        }),
                      },
                      'drawHighlights',
                      'showContextMenu',
                      'pushSelectedComponent',
                    ],
                  },
                  {
                    actions: [
                      {
                        type: 'setSelection',
                        params: ({ event }) => ({
                          component: event.component,
                          x: event.x,
                          y: event.y,
                        }),
                      },
                      'drawHighlights',
                      'pushSelectedComponent',
                    ],
                  },
                ],
                ESCAPE: {
                  target: 'idle',
                  actions: [
                    'clearSelectionContext',
                    'hideContextMenu',
                    'clearSelectedComponentRPC',
                    'recordEscapeTime',
                    'drawHighlights',
                  ],
                },
                START_RECORDING: {
                  target: 'recording',
                  actions: ['hideContextMenu'],
                },
              },
            },

            recording: {
              entry: ['suspendForRecording'],
              exit: ['resumeAfterRecording'],
              on: {
                STOP_RECORDING: [
                  { target: 'idle', guard: 'isAnySourceActive' },
                  { target: '#highlight.overlay.disabled' },
                ],
              },
            },
          },
        },
      },
    },

    // ════════════════════════════════════════════════════════════════
    // Click-through — Alt toggles pointer-events pass-through
    // ════════════════════════════════════════════════════════════════
    clickThrough: {
      initial: 'off',
      states: {
        off: {
          on: {
            TOGGLE_CLICK_THROUGH: {
              target: 'on',
              guard: 'isAnySourceActive',
              actions: ['enableClickThroughDOM', 'notifyClickThrough'],
            },
          },
        },
        on: {
          on: {
            TOGGLE_CLICK_THROUGH: {
              target: 'off',
              actions: ['disableClickThroughDOM', 'notifyClickThrough'],
            },
            // Reset click-through when all sources deactivate
            DOCK_DEACTIVATE: { target: 'off' },
            PANEL_HIGHLIGHTER_DEACTIVATE: [
              { target: 'off', guard: 'noSourceActive' },
            ],
          },
        },
      },
    },
  },
})

// ─── Machine type export ────────────────────────────────────────────

export type HighlightMachine = typeof highlightMachine
export type HighlightActor = ActorRefFrom<typeof highlightMachine>

// ─── Singleton actor ────────────────────────────────────────────────

let _actor: HighlightActor | null = null

/** Get (or create) the singleton highlight actor. */
export function getHighlightActor(): HighlightActor {
  if (!_actor) {
    _actor = createActor(highlightMachine)
    _actor.start()
  }
  return _actor
}

/**
 * Create the singleton actor with real side-effect actions.
 * Call once during initialization (from listeners.ts).
 * Subsequent calls to getHighlightActor() return the same instance.
 */
export function createHighlightActor(
  actions: Partial<Record<string, (...args: any[]) => void>>,
): HighlightActor {
  if (_actor) return _actor
  const provided = highlightMachine.provide({ actions: actions as any })
  _actor = createActor(provided)
  _actor.start()
  return _actor
}

// ─── Snapshot helpers ───────────────────────────────────────────────

export function isOverlayActive(actor: HighlightActor): boolean {
  return (actor.getSnapshot() as any).matches({ overlay: 'enabled' })
}

export function isAnyActive(actor: HighlightActor): boolean {
  return actor.getSnapshot().context.mode !== 'inactive'
}

export function isClickThrough(actor: HighlightActor): boolean {
  return (actor.getSnapshot() as any).matches({ clickThrough: 'on' })
}

export function isRecordingState(actor: HighlightActor): boolean {
  return (actor.getSnapshot() as any).matches({
    overlay: { enabled: 'recording' },
  })
}
