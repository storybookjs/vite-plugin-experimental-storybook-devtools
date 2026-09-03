import { defineRpcFunction } from 'devframe'

// Panel → server → client: show/hide the selected component's persistent
// highlight without leaving highlight mode or losing the selection.
export const toggleHighlightVisibility = defineRpcFunction({
  name: 'toggle-highlight-visibility',
  type: 'action',
  setup: (ctx) => ({
    handler: () => {
      ctx.rpc.broadcast({
        method: 'component-highlighter:do-toggle-highlight-visibility',
        args: [],
      })
    },
  }),
})
