import { defineRpcFunction } from 'devframe'
import { getStorybookDevframeContext } from '../../context'

export const toggleOverlay = defineRpcFunction({
  name: 'toggle-overlay',
  type: 'action',
  setup: (ctx) => {
    const { logDebug } = getStorybookDevframeContext(ctx)
    return {
      handler: (data: { enabled: boolean }) => {
        logDebug('Toggle overlay:', data.enabled)
      },
    }
  },
})
