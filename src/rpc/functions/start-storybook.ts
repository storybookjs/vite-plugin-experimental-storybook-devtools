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

        state.storybookStartFailure = null

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
                // Same env the playgrounds' own `storybook` scripts set: app
                // bundler configs use it to keep this plugin out of
                // Storybook's builder (which loads the same config file).
                env: { ...process.env, STORYBOOK: 'true' } as Record<
                  string,
                  string
                >,
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
          // A dead session's stream is closed for good — drop it from the
          // terminals host so the next start can reuse the session id.
          const dropSession = () => {
            const session = state.storybookSession
            state.storybookSession = null
            if (session) {
              try {
                state.devtoolsTerminals?.remove?.(session)
              } catch {
                /* already gone */
              }
            }
          }

          if (cp) {
            cp.on('exit', (code: number | null) => {
              state.terminalLogs.push(`[process exited with code ${code}]`)
              if (code !== 0) {
                state.storybookStartFailure = { code }
                state.terminalLogs.push(
                  `[error] Storybook failed to start (exit code ${code}). ` +
                    'Check that Storybook is installed in this project — ' +
                    'see the log above for the underlying error.',
                )
              }
              dropSession()
            })
            cp.on('error', (err: Error) => {
              state.storybookStartFailure = { code: null }
              state.terminalLogs.push(
                `[error] Storybook failed to start: ${err.message}`,
              )
              dropSession()
            })
          }

          return { started: true }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err)
          state.storybookStartFailure = { code: null }
          state.terminalLogs.push(`[error] Failed to start Storybook: ${msg}`)
          return { started: false, error: msg }
        }
      },
    }
  },
})
