import { defineRpcFunction } from 'devframe'

// Panel → server → client: reset a prop to its original value
export const resetProp = defineRpcFunction({
  name: 'reset-prop',
  type: 'action',
  setup: (ctx) => ({
    handler: (data: { id: string; path: Array<string | number> }) => {
      ctx.rpc.broadcast({
        method: 'component-highlighter:do-reset-prop',
        args: [data],
      })
    },
  }),
})
