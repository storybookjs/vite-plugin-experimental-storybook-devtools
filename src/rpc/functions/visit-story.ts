import { defineRpcFunction } from 'devframe'

// Client/overlay → server → panel: navigate to a story. Stores as pending
// visit AND broadcasts so the panel can pick it up either via client RPC
// handler or by polling the pending-visit endpoint.
export const visitStory = defineRpcFunction({
  name: 'visit-story',
  type: 'action',
  setup: (ctx) => {
    return {
      handler: async (data: {
        relativeFilePath: string
        preferredStoryName?: string
      }) => {
        const store = await ctx.rpc.sharedState.get(
          'component-highlighter:pending-visit',
        )
        store.mutate((s: { value: typeof data | null }) => {
          s.value = data
        })
        ctx.rpc.broadcast({
          method: 'component-highlighter:do-visit-story',
          args: [data],
        })
      },
    }
  },
})
