import { describe, it, expect, vi } from 'vitest'
import { getDevToolsHookScript } from './devtools-hook'

type MinimalVueHook = {
  enabled: boolean
  cleanupBuffer: (component: unknown) => boolean
  emit: (event: string, ...args: unknown[]) => unknown
  on: (event: string, fn: (...args: unknown[]) => void) => void
  off: (event: string, fn: (...args: unknown[]) => void) => void
}

type HookWindow = {
  __VUE_DEVTOOLS_GLOBAL_HOOK__?: MinimalVueHook
  __chInstallVueHandler?: (fn: (event: string, args: unknown[]) => void) => void
}

/**
 * The script is the body of an inline classic <script>; its only global
 * dependency is `window`. Evaluate it against a fake window object.
 */
function runHookScript(win: HookWindow = {}): HookWindow {
  new Function('window', getDevToolsHookScript())(win)
  return win
}

describe('Vue devtools hook script', () => {
  it('installs a minimal enabled hook when none is present', () => {
    const win = runHookScript()

    expect(win.__VUE_DEVTOOLS_GLOBAL_HOOK__).toBeDefined()
    expect(win.__VUE_DEVTOOLS_GLOBAL_HOOK__!.enabled).toBe(true)
    expect(typeof win.__chInstallVueHandler).toBe('function')
  })

  it('exposes cleanupBuffer returning false — REQUIRED for component:removed', () => {
    // @vue/runtime-core only emits 'component:removed' when the hook has a
    // cleanupBuffer(component) method that returns falsy. Removing or breaking
    // this silently drops every unmount event (registry grows forever).
    const win = runHookScript()
    const hook = win.__VUE_DEVTOOLS_GLOBAL_HOOK__!

    expect(typeof hook.cleanupBuffer).toBe('function')
    expect(hook.cleanupBuffer({})).toBe(false)
  })

  it('relays component events to the bridge handler with the emit args', () => {
    const win = runHookScript()
    const handler = vi.fn()
    win.__chInstallVueHandler!(handler)

    // Vue's emit signature: emit(event, app, uid, parentUid, instance).
    const app = { name: 'app' }
    const instance = { uid: 7 }
    win.__VUE_DEVTOOLS_GLOBAL_HOOK__!.emit(
      'component:added',
      app,
      7,
      1,
      instance,
    )

    expect(handler).toHaveBeenCalledExactlyOnceWith('component:added', [
      app,
      7,
      1,
      instance,
    ])
    // The instance the runtime reads must be at args index 3.
    expect(handler.mock.calls[0]?.[1]?.[3]).toBe(instance)
  })

  it('swallows bridge handler errors so Vue rendering is never disrupted', () => {
    const win = runHookScript()
    win.__chInstallVueHandler!(() => {
      throw new Error('boom')
    })

    expect(() =>
      win.__VUE_DEVTOOLS_GLOBAL_HOOK__!.emit('component:added', {}, 1, 0, {}),
    ).not.toThrow()
  })

  it('supports on/off listeners alongside the bridge', () => {
    const win = runHookScript()
    const hook = win.__VUE_DEVTOOLS_GLOBAL_HOOK__!
    const listener = vi.fn()

    hook.on('component:updated', listener)
    hook.emit('component:updated', {}, 1, 0, {})
    expect(listener).toHaveBeenCalledTimes(1)

    hook.off('component:updated', listener)
    hook.emit('component:updated', {}, 1, 0, {})
    expect(listener).toHaveBeenCalledTimes(1)
  })

  describe('with a real devtools hook already installed', () => {
    function makeExistingHook(overrides: Partial<MinimalVueHook> = {}) {
      const emitted: unknown[][] = []
      const hook = {
        enabled: true,
        emit: (...args: unknown[]) => {
          emitted.push(args)
          return 'existing-result'
        },
        on: () => {},
        off: () => {},
        ...overrides,
      } as unknown as MinimalVueHook
      return { hook, emitted }
    }

    it('does not replace the existing hook', () => {
      const { hook } = makeExistingHook()
      const win = runHookScript({ __VUE_DEVTOOLS_GLOBAL_HOOK__: hook })

      expect(win.__VUE_DEVTOOLS_GLOBAL_HOOK__).toBe(hook)
    })

    it('adds cleanupBuffer if the existing hook lacks it', () => {
      const { hook } = makeExistingHook()
      const win = runHookScript({ __VUE_DEVTOOLS_GLOBAL_HOOK__: hook })

      const installed = win.__VUE_DEVTOOLS_GLOBAL_HOOK__!
      expect(typeof installed.cleanupBuffer).toBe('function')
      expect(installed.cleanupBuffer({})).toBe(false)
    })

    it('preserves an existing cleanupBuffer implementation', () => {
      const cleanupBuffer = vi.fn(() => true)
      const { hook } = makeExistingHook({ cleanupBuffer })
      runHookScript({ __VUE_DEVTOOLS_GLOBAL_HOOK__: hook })

      expect(hook.cleanupBuffer).toBe(cleanupBuffer)
    })

    it('wraps emit so both the real hook and the bridge handler receive events', () => {
      const { hook, emitted } = makeExistingHook()
      const win = runHookScript({ __VUE_DEVTOOLS_GLOBAL_HOOK__: hook })

      const handler = vi.fn()
      win.__chInstallVueHandler!(handler)

      const instance = { uid: 3 }
      const result = win.__VUE_DEVTOOLS_GLOBAL_HOOK__!.emit(
        'component:removed',
        {},
        3,
        1,
        instance,
      )

      // Original emit still runs and its return value is preserved.
      expect(result).toBe('existing-result')
      expect(emitted).toHaveLength(1)
      // Our handler receives the same event with the instance at index 3.
      expect(handler).toHaveBeenCalledExactlyOnceWith('component:removed', [
        {},
        3,
        1,
        instance,
      ])
    })
  })
})
