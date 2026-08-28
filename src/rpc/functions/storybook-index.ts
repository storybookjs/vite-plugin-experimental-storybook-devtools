import { defineRpcFunction } from 'devframe'
import { getStorybookDevframeContext } from '../../context'

export const storybookIndex = defineRpcFunction({
  name: 'storybook-index',
  type: 'query',
  setup: (ctx) => {
    const { storybookUrl } = getStorybookDevframeContext(ctx)
    return {
      handler: async () => {
        try {
          const indexUrl = new URL('/index.json', storybookUrl).href
          const r = await fetch(indexUrl, {
            signal: AbortSignal.timeout(5000),
          })
          return await r.json()
        } catch {
          return { v: 0, entries: {} }
        }
      },
    }
  },
})
