import { defineRpcFunction } from 'devframe'

// Panel → server → client: highlight coverage instances on the app page
export const highlightCoverageInstances = defineRpcFunction({
  name: 'highlight-coverage-instances',
  type: 'action',
  setup: (ctx) => ({
    handler: (data: { componentName: string; hasStory: boolean } | null) => {
      ctx.rpc.broadcast({
        method: 'component-highlighter:do-highlight-coverage',
        args: [data],
      })
    },
  }),
})
