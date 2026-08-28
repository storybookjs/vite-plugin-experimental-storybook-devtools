import { defineRpcFunction } from 'devframe'

// Panel → server → client: apply a live prop override
export const setProp = defineRpcFunction({
  name: 'set-prop',
  type: 'action',
  setup: (ctx) => ({
    handler: (data: {
      id: string
      path: Array<string | number>
      payload: { kind: string; text: string }
    }) => {
      ctx.rpc.broadcast({
        method: 'component-highlighter:do-set-prop',
        args: [data],
      })
    },
  }),
})
