import { defineRpcFunction } from 'devframe'
import { getStorybookDevframeContext } from '../../context'

export const storybookStatus = defineRpcFunction({
  name: 'storybook-status',
  type: 'query',
  setup: (ctx) => {
    const { storybookUrl } = getStorybookDevframeContext(ctx)
    return {
      handler: async () => {
        try {
          const r = await fetch(storybookUrl, {
            signal: AbortSignal.timeout(3000),
          })
          return { running: r.ok }
        } catch {
          return { running: false }
        }
      },
    }
  },
})
