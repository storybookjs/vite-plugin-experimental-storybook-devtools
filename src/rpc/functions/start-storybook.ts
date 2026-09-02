import { defineRpcFunction } from 'devframe'
import { getStorybookDevframeContext } from '../../context'
import {
  adoptStorybookSession,
  pushTerminalLine,
} from '../../storybook-process'

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
          const session = await state.devtoolsTerminals.startChildProcess(
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
              // STORYBOOK: same env the playgrounds' own `storybook` scripts
              // set — app bundler configs use it to keep this plugin out of
              // Storybook's builder (which loads the same config file).
              // FORCE_COLOR: piped stdio has no TTY, so the CLI would drop
              // its ANSI colors; the panel's Terminal tab renders them.
              env: {
                ...process.env,
                STORYBOOK: 'true',
                FORCE_COLOR: '1',
              } as Record<string, string>,
            },
            {
              id: 'storybook-dev',
              title: 'Storybook',
              icon: 'ph:book-duotone',
            },
          )

          // A dead session's stream is closed for good — drop it from the
          // terminals host so the next start can reuse the session id.
          adoptStorybookSession(state, session, (dead) => {
            try {
              state.devtoolsTerminals?.remove?.(dead)
            } catch {
              /* already gone */
            }
          })

          return { started: true }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err)
          state.storybookStartFailure = { code: null }
          pushTerminalLine(state, `[error] Failed to start Storybook: ${msg}`)
          return { started: false, error: msg }
        }
      },
    }
  },
})
