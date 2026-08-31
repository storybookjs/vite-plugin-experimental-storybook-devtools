import type { DevframeNodeContext } from 'devframe'
import type { ViteDevServer } from 'vite'
import type { FrameworkConfig } from './frameworks'
import type { NotificationService } from './notifications'

/**
 * Mutable state shared between the transform plugin and the RPC handlers.
 * Fields not yet known at devframe `setup()` time (terminals, the DevTools
 * notification service, shared-state handles) are populated later by
 * `kitSetup` in `create-component-highlighter-plugin.ts`.
 */
export interface StorybookDevframeState {
  server: ViteDevServer | undefined
  notifications: NotificationService
  transformedComponents: Map<string, string>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  devtoolsTerminals: any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  storybookSession: any
  terminalLogs: string[]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  registryState: any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  pendingVisitState: any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  pendingTabState: any
}

export interface CreateStorybookDevframeDeps {
  framework: FrameworkConfig
  storybookUrl: string
  writeStoryFiles: boolean
  storiesDir: string | undefined
  logDebug: (...args: unknown[]) => void
  state: StorybookDevframeState
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
