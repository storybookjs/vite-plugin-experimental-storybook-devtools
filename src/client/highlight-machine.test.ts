import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createActor } from 'xstate'
import { highlightMachine } from './highlight-machine'
import type { ComponentInstance } from '../frameworks/types'

function stubComponent(id = 'comp-1', name = 'Button'): ComponentInstance {
  return {
    id,
    meta: {
      componentName: name,
      filePath: `/src/${name}.tsx`,
      relativeFilePath: `src/${name}.tsx`,
      sourceId: id,
      isDefaultExport: false,
    },
    props: {},
    element: null as any,
    rect: { left: 10, top: 10, width: 100, height: 50 } as DOMRect,
  }
}

function createTestActor() {
  const actions = {
    createOverlayDOM: vi.fn(),
    removeOverlayDOM: vi.fn(),
    drawHighlights: vi.fn(),
    showContextMenu: vi.fn(),
    hideContextMenu: vi.fn(),
    pushSelectedComponent: vi.fn(),
    clearSelectedComponentRPC: vi.fn(),
    syncHighlightActiveRPC: vi.fn(),
    syncHighlighterTabInactiveRPC: vi.fn(),
    enableClickThroughDOM: vi.fn(),
    disableClickThroughDOM: vi.fn(),
    notifyClickThrough: vi.fn(),
    deactivateDock: vi.fn(),
    suspendForRecording: vi.fn(),
    resumeAfterRecording: vi.fn(),
  }

  const machine = highlightMachine.provide({ actions: actions as any })
  const actor = createActor(machine)
  actor.start()
  return { actor, actions }
}

function snap(actor: ReturnType<typeof createTestActor>['actor']) {
  return actor.getSnapshot()
}

function matches(
  actor: ReturnType<typeof createTestActor>['actor'],
  value: any,
) {
  return (snap(actor) as any).matches(value)
}

describe('highlight state machine', () => {
  let actor: ReturnType<typeof createTestActor>['actor']
  let actions: ReturnType<typeof createTestActor>['actions']

  beforeEach(() => {
    const t = createTestActor()
    actor = t.actor
    actions = t.actions
  })

  describe('initial state', () => {
    it('starts with overlay disabled and clickThrough off', () => {
      expect(matches(actor, { overlay: 'disabled' })).toBe(true)
      expect(matches(actor, { clickThrough: 'off' })).toBe(true)
    })

    it('starts with empty context', () => {
      const ctx = snap(actor).context
      expect(ctx.mode).toBe('inactive')
      expect(ctx.dockWasActive).toBe(false)
      expect(ctx.hoveredComponentId).toBeNull()
      expect(ctx.selectedComponentId).toBeNull()
    })
  })

  describe('dock activation', () => {
    it('DOCK_ACTIVATE enables overlay and sets dock mode', () => {
      actor.send({ type: 'DOCK_ACTIVATE' })

      expect(snap(actor).context.mode).toBe('dock')
      expect(matches(actor, { overlay: 'enabled' })).toBe(true)
      expect(actions.createOverlayDOM).toHaveBeenCalled()
      expect(actions.syncHighlightActiveRPC).toHaveBeenCalled()
    })

    it('DOCK_DEACTIVATE disables overlay when no other source active', () => {
      actor.send({ type: 'DOCK_ACTIVATE' })
      actor.send({ type: 'DOCK_DEACTIVATE' })

      expect(snap(actor).context.mode).toBe('inactive')
      expect(matches(actor, { overlay: 'disabled' })).toBe(true)
      expect(actions.removeOverlayDOM).toHaveBeenCalled()
      expect(actions.syncHighlighterTabInactiveRPC).toHaveBeenCalled()
    })

    it('DOCK_DEACTIVATE keeps overlay when panel is active', () => {
      actor.send({ type: 'DOCK_ACTIVATE' })
      actor.send({ type: 'PANEL_HIGHLIGHTER_ACTIVATE' })
      actions.removeOverlayDOM.mockClear()

      actor.send({ type: 'DOCK_DEACTIVATE' })

      expect(snap(actor).context.mode).toBe('panel')
      expect(snap(actor).context.dockWasActive).toBe(false)
      expect(matches(actor, { overlay: 'enabled' })).toBe(true)
      expect(actions.removeOverlayDOM).not.toHaveBeenCalled()
    })
  })

  describe('panel activation', () => {
    it('PANEL_HIGHLIGHTER_ACTIVATE enables overlay', () => {
      actor.send({ type: 'PANEL_HIGHLIGHTER_ACTIVATE' })

      expect(snap(actor).context.mode).toBe('panel')
      expect(matches(actor, { overlay: 'enabled' })).toBe(true)
    })

    it('PANEL_HIGHLIGHTER_DEACTIVATE disables overlay when dock inactive', () => {
      actor.send({ type: 'PANEL_HIGHLIGHTER_ACTIVATE' })
      actor.send({ type: 'PANEL_HIGHLIGHTER_DEACTIVATE' })

      expect(matches(actor, { overlay: 'disabled' })).toBe(true)
    })

    it('PANEL_HIGHLIGHTER_DEACTIVATE keeps overlay when dock was active', () => {
      actor.send({ type: 'DOCK_ACTIVATE' })
      actor.send({ type: 'PANEL_HIGHLIGHTER_ACTIVATE' })
      actor.send({ type: 'PANEL_HIGHLIGHTER_DEACTIVATE' })

      expect(matches(actor, { overlay: 'enabled' })).toBe(true)
      expect(snap(actor).context.mode).toBe('dock')
    })
  })

  describe('hover', () => {
    it('updates hoveredComponentId when overlay is enabled', () => {
      actor.send({ type: 'DOCK_ACTIVATE' })
      actor.send({ type: 'HOVER', componentId: 'comp-1' })

      expect(snap(actor).context.hoveredComponentId).toBe('comp-1')
      expect(actions.drawHighlights).toHaveBeenCalled()
    })

    it('clears hover with null', () => {
      actor.send({ type: 'DOCK_ACTIVATE' })
      actor.send({ type: 'HOVER', componentId: 'comp-1' })
      actor.send({ type: 'HOVER', componentId: null })

      expect(snap(actor).context.hoveredComponentId).toBeNull()
    })

    it('ignores HOVER when overlay is disabled', () => {
      actor.send({ type: 'HOVER', componentId: 'comp-1' })
      expect(snap(actor).context.hoveredComponentId).toBeNull()
    })
  })

  describe('selection & context menu', () => {
    it('SELECT_COMPONENT shows context menu when panel is inactive', () => {
      actor.send({ type: 'DOCK_ACTIVATE' })
      const comp = stubComponent()
      actor.send({
        type: 'SELECT_COMPONENT',
        component: comp,
        x: 50,
        y: 50,
      })

      expect(snap(actor).context.selectedComponentId).toBe('comp-1')
      expect(snap(actor).context.selectedComponent).toBe(comp)
      expect(matches(actor, { overlay: { enabled: 'selected' } })).toBe(true)
      expect(actions.showContextMenu).toHaveBeenCalled()
      expect(actions.pushSelectedComponent).toHaveBeenCalled()
    })

    it('SELECT_COMPONENT skips context menu when panel is active', () => {
      actor.send({ type: 'PANEL_HIGHLIGHTER_ACTIVATE' })
      const comp = stubComponent()
      actor.send({
        type: 'SELECT_COMPONENT',
        component: comp,
        x: 50,
        y: 50,
      })

      expect(snap(actor).context.selectedComponentId).toBe('comp-1')
      expect(matches(actor, { overlay: { enabled: 'selected' } })).toBe(true)
      expect(actions.showContextMenu).not.toHaveBeenCalled()
      expect(actions.pushSelectedComponent).toHaveBeenCalled()
    })

    it('CLEAR_SELECTION returns to idle', () => {
      actor.send({ type: 'DOCK_ACTIVATE' })
      actor.send({
        type: 'SELECT_COMPONENT',
        component: stubComponent(),
        x: 50,
        y: 50,
      })
      actor.send({ type: 'CLEAR_SELECTION' })

      expect(snap(actor).context.selectedComponentId).toBeNull()
      expect(matches(actor, { overlay: { enabled: 'idle' } })).toBe(true)
      expect(actions.hideContextMenu).toHaveBeenCalled()
      expect(actions.clearSelectedComponentRPC).toHaveBeenCalled()
    })

    it('CONTEXT_MENU_CLOSED returns to idle without calling hideContextMenu', () => {
      actor.send({ type: 'DOCK_ACTIVATE' })
      actor.send({
        type: 'SELECT_COMPONENT',
        component: stubComponent(),
        x: 50,
        y: 50,
      })
      actions.hideContextMenu.mockClear()

      actor.send({ type: 'CONTEXT_MENU_CLOSED' })

      expect(snap(actor).context.selectedComponentId).toBeNull()
      expect(matches(actor, { overlay: { enabled: 'idle' } })).toBe(true)
      expect(actions.hideContextMenu).not.toHaveBeenCalled()
    })

    it('ESCAPE with selection clears it and goes to idle', () => {
      actor.send({ type: 'DOCK_ACTIVATE' })
      actor.send({
        type: 'SELECT_COMPONENT',
        component: stubComponent(),
        x: 50,
        y: 50,
      })
      actor.send({ type: 'ESCAPE' })

      expect(snap(actor).context.selectedComponentId).toBeNull()
      expect(matches(actor, { overlay: { enabled: 'idle' } })).toBe(true)
    })

    it('re-selecting a different component updates selection', () => {
      actor.send({ type: 'DOCK_ACTIVATE' })
      actor.send({
        type: 'SELECT_COMPONENT',
        component: stubComponent('c1', 'A'),
        x: 10,
        y: 10,
      })
      actor.send({
        type: 'SELECT_COMPONENT',
        component: stubComponent('c2', 'B'),
        x: 20,
        y: 20,
      })

      expect(snap(actor).context.selectedComponentId).toBe('c2')
      expect(snap(actor).context.selectedComponent?.meta.componentName).toBe(
        'B',
      )
    })
  })

  describe('double escape', () => {
    it('first escape records time, second within threshold triggers deactivateDock', () => {
      actor.send({ type: 'DOCK_ACTIVATE' })

      actor.send({ type: 'ESCAPE' })
      expect(snap(actor).context.lastEscapeTime).toBeGreaterThan(0)
      expect(actions.deactivateDock).not.toHaveBeenCalled()

      // Second escape immediately → within 600ms threshold
      actor.send({ type: 'ESCAPE' })
      expect(actions.deactivateDock).toHaveBeenCalled()
    })
  })

  describe('click-through', () => {
    it('toggles on and off', () => {
      actor.send({ type: 'DOCK_ACTIVATE' })

      actor.send({ type: 'TOGGLE_CLICK_THROUGH' })
      expect(matches(actor, { clickThrough: 'on' })).toBe(true)
      expect(actions.enableClickThroughDOM).toHaveBeenCalled()

      actor.send({ type: 'TOGGLE_CLICK_THROUGH' })
      expect(matches(actor, { clickThrough: 'off' })).toBe(true)
      expect(actions.disableClickThroughDOM).toHaveBeenCalled()
    })

    it('ignores toggle when no source is active', () => {
      actor.send({ type: 'TOGGLE_CLICK_THROUGH' })
      expect(matches(actor, { clickThrough: 'off' })).toBe(true)
    })

    it('resets to off when all sources deactivate', () => {
      actor.send({ type: 'DOCK_ACTIVATE' })
      actor.send({ type: 'TOGGLE_CLICK_THROUGH' })
      expect(matches(actor, { clickThrough: 'on' })).toBe(true)

      actor.send({ type: 'DOCK_DEACTIVATE' })
      expect(matches(actor, { clickThrough: 'off' })).toBe(true)
    })
  })

  describe('recording', () => {
    it('START_RECORDING transitions to recording state', () => {
      actor.send({ type: 'DOCK_ACTIVATE' })
      actor.send({ type: 'START_RECORDING' })

      expect(
        matches(actor, { overlay: { enabled: 'recording' } }),
      ).toBe(true)
      expect(actions.suspendForRecording).toHaveBeenCalled()
    })

    it('STOP_RECORDING returns to idle when source is active', () => {
      actor.send({ type: 'DOCK_ACTIVATE' })
      actor.send({ type: 'START_RECORDING' })
      actor.send({ type: 'STOP_RECORDING' })

      expect(matches(actor, { overlay: { enabled: 'idle' } })).toBe(true)
      expect(actions.resumeAfterRecording).toHaveBeenCalled()
    })

    it('START_RECORDING from selected state hides context menu', () => {
      actor.send({ type: 'DOCK_ACTIVATE' })
      actor.send({
        type: 'SELECT_COMPONENT',
        component: stubComponent(),
        x: 50,
        y: 50,
      })
      actions.hideContextMenu.mockClear()

      actor.send({ type: 'START_RECORDING' })
      expect(actions.hideContextMenu).toHaveBeenCalled()
      expect(
        matches(actor, { overlay: { enabled: 'recording' } }),
      ).toBe(true)
    })
  })

  describe('combined state scenarios', () => {
    it('Scenario 3: panel close cleanup — overlay turns off', () => {
      actor.send({ type: 'PANEL_HIGHLIGHTER_ACTIVATE' })
      expect(matches(actor, { overlay: 'enabled' })).toBe(true)

      actor.send({ type: 'PANEL_HIGHLIGHTER_DEACTIVATE' })
      expect(matches(actor, { overlay: 'disabled' })).toBe(true)
    })

    it('Scenario 4: action button + panel interaction', () => {
      actor.send({ type: 'DOCK_ACTIVATE' })
      expect(matches(actor, { overlay: 'enabled' })).toBe(true)

      actor.send({ type: 'PANEL_HIGHLIGHTER_ACTIVATE' })
      expect(matches(actor, { overlay: 'enabled' })).toBe(true)

      // Select a component while panel is active (no context menu)
      actor.send({
        type: 'SELECT_COMPONENT',
        component: stubComponent('c1', 'TaskList'),
        x: 50,
        y: 50,
      })
      expect(snap(actor).context.selectedComponentId).toBe('c1')
      expect(actions.showContextMenu).not.toHaveBeenCalled()

      // Panel closes → overlay stays on (dock was active), selection cleared
      actor.send({ type: 'PANEL_HIGHLIGHTER_DEACTIVATE' })
      expect(matches(actor, { overlay: { enabled: 'idle' } })).toBe(true)
      expect(snap(actor).context.mode).toBe('dock')
      expect(snap(actor).context.selectedComponentId).toBeNull()

      // Context menu works on new selection (dock mode)
      actor.send({
        type: 'SELECT_COMPONENT',
        component: stubComponent('c2', 'Button'),
        x: 100,
        y: 100,
      })
      expect(actions.showContextMenu).toHaveBeenCalled()
    })

    it('Scenario 5: panel reopen — overlay re-activates', () => {
      actor.send({ type: 'PANEL_HIGHLIGHTER_ACTIVATE' })
      expect(matches(actor, { overlay: 'enabled' })).toBe(true)

      actor.send({ type: 'PANEL_HIGHLIGHTER_DEACTIVATE' })
      expect(matches(actor, { overlay: 'disabled' })).toBe(true)

      actor.send({ type: 'PANEL_HIGHLIGHTER_ACTIVATE' })
      expect(matches(actor, { overlay: 'enabled' })).toBe(true)
    })

    it('dock deactivation clears selection and hover', () => {
      actor.send({ type: 'DOCK_ACTIVATE' })
      actor.send({ type: 'HOVER', componentId: 'comp-1' })
      actor.send({
        type: 'SELECT_COMPONENT',
        component: stubComponent(),
        x: 50,
        y: 50,
      })

      expect(snap(actor).context.hoveredComponentId).toBe('comp-1')
      expect(snap(actor).context.selectedComponentId).toBe('comp-1')

      actor.send({ type: 'DOCK_DEACTIVATE' })

      expect(snap(actor).context.hoveredComponentId).toBeNull()
      expect(snap(actor).context.selectedComponentId).toBeNull()
    })

    it('panel close then dock activate does NOT restore stale selection', () => {
      // Panel open → select component
      actor.send({ type: 'PANEL_HIGHLIGHTER_ACTIVATE' })
      actor.send({
        type: 'SELECT_COMPONENT',
        component: stubComponent('c1', 'TaskList'),
        x: 50,
        y: 50,
      })
      expect(snap(actor).context.selectedComponentId).toBe('c1')

      // Close panel (no dock active) → overlay disabled, selection preserved in context
      actor.send({ type: 'PANEL_HIGHLIGHTER_DEACTIVATE' })
      expect(matches(actor, { overlay: 'disabled' })).toBe(true)
      expect(snap(actor).context.selectedComponentId).toBe('c1')

      // Now enable dock → should NOT restore stale selection
      actions.showContextMenu.mockClear()
      actions.pushSelectedComponent.mockClear()
      actor.send({ type: 'DOCK_ACTIVATE' })

      expect(matches(actor, { overlay: { enabled: 'idle' } })).toBe(true)
      expect(snap(actor).context.selectedComponentId).toBeNull()
      expect(actions.pushSelectedComponent).not.toHaveBeenCalled()

      // Context menu should work on new selection
      actor.send({
        type: 'SELECT_COMPONENT',
        component: stubComponent('c2', 'Button'),
        x: 100,
        y: 100,
      })
      expect(actions.showContextMenu).toHaveBeenCalled()
    })

    it('panel tab switch preserves selection', () => {
      actor.send({ type: 'PANEL_HIGHLIGHTER_ACTIVATE' })
      actor.send({
        type: 'SELECT_COMPONENT',
        component: stubComponent('c1', 'TaskList'),
        x: 50,
        y: 50,
      })
      expect(snap(actor).context.selectedComponentId).toBe('c1')

      // Switch away from highlighter tab
      actor.send({ type: 'PANEL_HIGHLIGHTER_DEACTIVATE' })
      expect(matches(actor, { overlay: 'disabled' })).toBe(true)
      // Selection preserved in context
      expect(snap(actor).context.selectedComponentId).toBe('c1')
      expect(snap(actor).context.selectedComponent?.meta.componentName).toBe('TaskList')

      // Switch back → restores selected state
      actor.send({ type: 'PANEL_HIGHLIGHTER_ACTIVATE' })
      expect(matches(actor, { overlay: { enabled: 'selected' } })).toBe(true)
      expect(snap(actor).context.selectedComponentId).toBe('c1')
      expect(actions.pushSelectedComponent).toHaveBeenCalled()
    })
  })
})
