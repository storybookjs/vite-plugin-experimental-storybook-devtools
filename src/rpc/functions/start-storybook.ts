import { defineRpcFunction } from 'devframe'
import { getStorybookDevframeContext } from '../../context'

const MAX_LOG_LINES = 2000

export const startStorybook = defineRpcFunction({
  name: 'start-storybook',
  type: 'action',
  setup: (ctx) => {
    const { storybookUrl, state } = getStorybookDevframeContext(ctx)
    return {
      handler: async () => {
        if (state.storybookSession) {
          return { started: true, alreadyRunning: true }
        }

        if (!state.devtoolsTerminals) {
          return { started: false, error: 'Terminals API not available' }
        }

        try {
          state.storybookSession =
            await state.devtoolsTerminals.startChildProcess(
              {
                command: 'npx',
                args: [
                  'storybook',
                  'dev',
                  '-p',
                  new URL(storybookUrl).port || '6006',
                  '--no-open',
                ],
                cwd: ctx.cwd,
              },
              {
                id: 'storybook-dev',
                title: 'Storybook',
                icon: 'ph:book-duotone',
              },
            )

          // Capture stdout/stderr into the log buffer
          const cp = state.storybookSession.getChildProcess()
          if (cp?.stdout) {
            cp.stdout.on('data', (chunk: Buffer) => {
              const lines = chunk.toString().split('\n')
              for (const line of lines) {
                if (line) {
                  state.terminalLogs.push(line)
                  if (state.terminalLogs.length > MAX_LOG_LINES) {
                    state.terminalLogs.shift()
                  }
                }
              }
            })
          }
          if (cp?.stderr) {
            cp.stderr.on('data', (chunk: Buffer) => {
              const lines = chunk.toString().split('\n')
              for (const line of lines) {
                if (line) {
                  state.terminalLogs.push(line)
                  if (state.terminalLogs.length > MAX_LOG_LINES) {
                    state.terminalLogs.shift()
                  }
                }
              }
            })
          }
          if (cp) {
            cp.on('exit', (code: number | null) => {
              state.terminalLogs.push(`[process exited with code ${code}]`)
              state.storybookSession = null
            })
          }

          return { started: true }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err)
          state.terminalLogs.push(`[error] Failed to start Storybook: ${msg}`)
          return { started: false, error: msg }
        }
      },
    }
  },
})
