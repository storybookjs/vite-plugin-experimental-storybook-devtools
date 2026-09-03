import { defineRpcFunction } from 'devframe'

// Panel → server → client: scroll to a component
export const scrollToComponent = defineRpcFunction({
  name: 'scroll-to-component',
  type: 'action',
  setup: (ctx) => ({
    handler: (data: { componentName: string; id?: string }) => {
      ctx.rpc.broadcast({
        method: 'component-highlighter:do-scroll-to-component',
        args: [data],
      })
    },
  }),
})
