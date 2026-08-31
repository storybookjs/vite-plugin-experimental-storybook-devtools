import { defineRpcFunction } from 'devframe'
import { computeCoverage } from '../../coverage-dashboard'
import { getStorybookDevframeContext } from '../../context'

// Coverage dashboard — RPC to fetch coverage data
export const getCoverage = defineRpcFunction({
  name: 'get-coverage',
  type: 'query',
  setup: (ctx) => {
    const { state, storiesDir } = getStorybookDevframeContext(ctx)
    return {
      handler: () => {
        const coverage = computeCoverage(
          state.transformedComponents,
          ctx.cwd,
          storiesDir,
        )
        return coverage
      },
    }
  },
})
