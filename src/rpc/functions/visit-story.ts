import { defineRpcFunction } from 'devframe'
import { getStorybookDevframeContext } from '../../context'

// Client/overlay → server → panel: navigate to a story. Stores as pending
// visit AND broadcasts so the panel can pick it up either via client RPC
// handler or by polling the pending-visit endpoint.
export const visitStory = defineRpcFunction({
  name: 'visit-story',
  type: 'action',
  setup: (ctx) => {
    const { state } = getStorybookDevframeContext(ctx)
    return {
      handler: (data: {
        relativeFilePath: string
        preferredStoryName?: string
      }) => {
        if (state.pendingVisitState) {
          state.pendingVisitState.mutate(() => data)
        }
        ctx.rpc.broadcast({
          method: 'component-highlighter:do-visit-story',
          args: [data],
        })
      },
    }
  },
})
