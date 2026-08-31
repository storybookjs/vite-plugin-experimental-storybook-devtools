import { defineRpcFunction } from 'devframe'

// Panel → server → client: toggle highlight mode
export const setHighlightMode = defineRpcFunction({
  name: 'set-highlight-mode',
  type: 'action',
  setup: (ctx) => ({
    handler: (data: { enabled: boolean }) => {
      ctx.rpc.broadcast({
        method: 'component-highlighter:do-set-highlight-mode',
        args: [data],
      })
    },
  }),
})
