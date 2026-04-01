/// <reference types="@vitejs/devtools-kit" />
/// <reference types="vite/client" />
import type { DockClientScriptContext } from '@vitejs/devtools-kit/client'
import { overlayEvents, showStoryCreationFeedback, hideContextMenu } from './overlay'
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

  // Expose a function so the double-Escape handler in listeners.ts can
  // programmatically toggle the dock off (updates the DevTools button state).
  ;(window as any).__componentHighlighterDeactivateDock = () => {
    ctx.docks.toggleEntry(ctx.current.entryMeta.id)
  }

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
      async (data: {
        filePath: string
        componentName: string
        componentPath?: string
        relativeFilePath?: string
        storyName?: string
        isAppend?: boolean
      }) => {
        debug(
          `Story created for ${data.componentName}: ${data.filePath}`,
        )
        showStoryCreationFeedback('success', data.filePath, data.componentPath)

        // If Storybook is already running, open the panel and navigate to the
        // newly created story so the user can see it immediately.
        const relPath = data.relativeFilePath
        if (!relPath) return

        try {
          const statusRes = await fetch(
            '/__component-highlighter/storybook-status',
          )
          if (!statusRes.ok) return
          const status = await statusRes.json()
          if (!status.running) return
        } catch {
          return
        }

        const storyName = data.storyName

        // Close the context menu now that we're navigating to the story
        hideContextMenu()

        // Panel already open → navigate directly
        let visitFn = (window as any).__storybookDevtoolsVisitStory
        if (typeof visitFn === 'function') {
          visitFn(relPath, storyName)
          return
        }

        // Panel not open yet — switch to it and wait for the panel to register
        if (ctx.docks?.switchEntry) {
          await ctx.docks.switchEntry('storybook-devtools-panel')
          for (let i = 0; i < 20; i++) {
            await new Promise((r) => setTimeout(r, 150))
            visitFn = (window as any).__storybookDevtoolsVisitStory
            if (typeof visitFn === 'function') {
              visitFn(relPath, storyName)
              return
            }
          }
        }
      },
    )
  }
}
