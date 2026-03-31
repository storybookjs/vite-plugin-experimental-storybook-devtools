/// <reference types="@vitejs/devtools-kit" />
/// <reference types="vite/client" />
import type { DockClientScriptContext } from '@vitejs/devtools-kit/client'
import { overlayEvents, showStoryCreationFeedback } from './overlay'
import { enableHighlightMode, disableHighlightMode } from './listeners'
import { debug, error as logError } from './logger'

// Track previous subscription so we never stack duplicate listeners
// (clientScriptSetup may be called more than once on HMR or dock reconnect)
let unsubLogInfo: (() => void) | null = null

export default function clientScriptSetup(ctx: DockClientScriptContext): void {
  debug('clientScriptSetup called')

  // When dock is activated, enable highlight mode
  ctx.current.events.on('entry:activated', () => {
    debug('dock activated - enabling highlight mode')
    enableHighlightMode()
  })

  // When dock is deactivated, disable highlight mode
  ctx.current.events.on('entry:deactivated', () => {
    debug('dock deactivated - disabling highlight mode')
    disableHighlightMode()
  })

  // Clean up previous listener before adding a new one
  if (unsubLogInfo) {
    unsubLogInfo()
    unsubLogInfo = null
  }

  // Listen for "Create Story" button clicks from overlay
  unsubLogInfo = overlayEvents.on('log-info', async (data) => {
    debug(
      'log-info event received, calling RPC:',
      data.meta.componentName,
      'story:',
      data.storyName,
    )

    try {
      // Pass serialized props and component registry to the server
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (ctx.rpc.call as any)('component-highlighter:create-story', {
        meta: data.meta,
        props: data.props,
        serializedProps: data.serializedProps,
        componentRegistry: data.componentRegistry,
        storyName: data.storyName,
        ...(data.playFunction ? { playFunction: data.playFunction } : {}),
        ...(data.playImports ? { playImports: data.playImports } : {}),
      })

      debug('RPC call successful')
      // Feedback will be shown via HMR event from server
    } catch (err) {
      logError('RPC call failed:', err)
      // Show error feedback in overlay
      showStoryCreationFeedback('error')
    }
  })

  // Listen for story creation confirmation from the server via HMR
  if (import.meta.hot) {
    import.meta.hot.on(
      'component-highlighter:story-created',
      (data: {
        filePath: string
        componentName: string
        componentPath?: string
      }) => {
        debug(
          `Story created for ${data.componentName}: ${data.filePath}`,
        )
        showStoryCreationFeedback('success', data.filePath, data.componentPath)
      },
    )
  }
}
