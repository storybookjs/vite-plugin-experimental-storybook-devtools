/// <reference types="@vitejs/devtools-kit" />
/// <reference types="vite/client" />
import type { DockClientScriptContext } from '@vitejs/devtools-kit/client'
import { overlayEvents, showStoryCreationFeedback } from './overlay'
import { enableHighlightMode, disableHighlightMode } from './listeners'

export default function clientScriptSetup(ctx: DockClientScriptContext): void {
  console.log('[component-highlighter] clientScriptSetup called')

  // When dock is activated, enable highlight mode
  ctx.current.events.on('entry:activated', () => {
    console.log(
      '[component-highlighter] dock activated - enabling highlight mode',
    )
    enableHighlightMode()
  })

  // When dock is deactivated, disable highlight mode
  ctx.current.events.on('entry:deactivated', () => {
    console.log(
      '[component-highlighter] dock deactivated - disabling highlight mode',
    )
    disableHighlightMode()
  })

  // Listen for "Create Story" button clicks from overlay
  overlayEvents.on('log-info', async (data) => {
    console.log(
      '[component-highlighter] log-info event received, calling RPC:',
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

      console.log('[component-highlighter] RPC call successful')
      // Feedback will be shown via HMR event from server
    } catch (error) {
      console.error('[component-highlighter] RPC call failed:', error)
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
        console.log(
          `[component-highlighter] ✅ Story created for ${data.componentName}: ${data.filePath}`,
        )
        showStoryCreationFeedback('success', data.filePath, data.componentPath)
      },
    )
  }
}
