import { defineRpcFunction } from 'devframe'

// Panel → server → client: batch highlight coverage instances (Preview button)
export const highlightCoverageBatch = defineRpcFunction({
  name: 'highlight-coverage-batch',
  type: 'action',
  setup: (ctx) => ({
    handler: (data: Array<{ componentName: string; hasStory: boolean }>) => {
      ctx.rpc.broadcast({
        method: 'component-highlighter:do-highlight-coverage-batch',
        args: [data],
      })
    },
  }),
})
