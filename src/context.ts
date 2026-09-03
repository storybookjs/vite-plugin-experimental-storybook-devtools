import type { DevframeNodeContext } from 'devframe'
import type { ViteDevServer } from 'vite'
import type { FrameworkConfig } from './frameworks'
import type { NotificationService } from './notifications'
import type { StorybookProjectInfo } from './storybook-project'

/**
 * Mutable state shared between the transform plugin and the RPC handlers.
 * Fields not yet known at devframe `setup()` time (terminals, the DevTools
 * notification service) are populated later by the host's kit/hub setup.
 * Shared-state stores are NOT cached here — `setup()` may run in more than
 * one context (e.g. Nuxt's client + SSR Vite), so handlers resolve stores
 * from their own `ctx.rpc.sharedState` per call.
 */
export interface StorybookDevframeState {
  server: ViteDevServer | undefined
  notifications: NotificationService
  transformedComponents: Map<string, string>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  devtoolsTerminals: any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  storybookSession: any
  /** Hub messages host, for failure toasts — set alongside `devtoolsTerminals`. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  devtoolsMessages: any
  /**
   * Set when the last `start-storybook` child process exited before
   * Storybook became reachable; cleared on the next start attempt.
   */
  storybookStartFailure: {
    code: number | null
    /** Short tail of the process output, shown as a failure preview. */
    detail?: string | null
  } | null
}

export interface CreateStorybookDevframeDeps {
  framework: FrameworkConfig
  storybookUrl: string
  writeStoryFiles: boolean
  storiesDir: string | undefined
  logDebug: (...args: unknown[]) => void
  state: StorybookDevframeState
  /**
   * The user's real Storybook project info (framework package, renderer,
   * builder, ...), read from their `.storybook/main` config. Kicked off by
   * the host at setup without being awaited on the startup path — handlers
   * that need it (story generation, the docs URL) await it themselves.
   * Resolves to `null` when no Storybook config is found; callers then fall
   * back to `framework.storybookFramework`.
   */
  storybookProject: Promise<StorybookProjectInfo | null>
}

const map = new WeakMap<DevframeNodeContext, CreateStorybookDevframeDeps>()

export function setStorybookDevframeContext(
  ctx: DevframeNodeContext,
  deps: CreateStorybookDevframeDeps,
): void {
  map.set(ctx, deps)
}

export function getStorybookDevframeContext(
  ctx: DevframeNodeContext,
): CreateStorybookDevframeDeps {
  const deps = map.get(ctx)
  if (!deps) {
    throw new Error(
      'StorybookDevframe context not initialized — call setStorybookDevframeContext in devframe.setup',
    )
  }
  return deps
}
