import { defineRpcFunction } from 'devframe'
import type { SerializedRegistryInstance } from '../../shared-types'

// Client/overlay → server → panel: select a component in the highlighter panel
export const selectComponent = defineRpcFunction({
  name: 'select-component',
  type: 'action',
  setup: (ctx) => ({
    handler: (data: SerializedRegistryInstance | null) => {
      ctx.rpc.broadcast({
        method: 'component-highlighter:do-select-component',
        args: [data],
      })
    },
  }),
})
