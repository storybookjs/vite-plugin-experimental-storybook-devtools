import { defineRpcFunction } from 'devframe'
import { getStorybookDevframeContext } from '../../context'

export const getTerminalLogs = defineRpcFunction({
  name: 'get-terminal-logs',
  type: 'query',
  setup: (ctx) => {
    const { state } = getStorybookDevframeContext(ctx)
    return {
      handler: (arg: { since: number }) => {
        const since = arg?.since ?? 0
        const lines = state.terminalLogs.slice(since)
        return { lines, total: state.terminalLogs.length }
      },
    }
  },
})
