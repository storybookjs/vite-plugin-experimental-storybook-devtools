import { defineRpcFunction } from 'devframe'
import { getStorybookDevframeContext } from '../../context'

export const storybookStatus = defineRpcFunction({
  name: 'storybook-status',
  type: 'query',
  setup: (ctx) => {
    const { storybookUrl, state } = getStorybookDevframeContext(ctx)
    return {
      handler: async () => {
        let running = false
        try {
          const r = await fetch(storybookUrl, {
            signal: AbortSignal.timeout(3000),
          })
          running = r.ok
        } catch {
          running = false
        }
        // Surfaced so the panel can distinguish "still starting" from "the
        // start attempt's process already died" while it polls this query.
        return { running, startFailure: state.storybookStartFailure }
      },
    }
  },
})
