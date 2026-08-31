import type { ChildProcess } from 'node:child_process'
import type { StorybookDevframeState } from './context'

/**
 * Structural slice of a devframe child-process terminal session — enough for
 * log capture and lifecycle tracking, so the hub and kit session types both
 * fit without importing either host package.
 */
export interface StorybookProcessSession {
  getChildProcess: () => ChildProcess | undefined
}

/**
 * Write one line to every context's terminal-logs stream. `setup()` may run
 * in more than one context (e.g. Nuxt's client + SSR Vite), each with its
 * own transport and channel — fanning out keeps the log visible from
 * whichever context a panel is connected to.
 */
export function pushTerminalLine(
  state: StorybookDevframeState,
  line: string,
): void {
  for (const sink of state.terminalLogSinks) {
    try {
      sink.write(line)
    } catch {
      // sink closed with its context
    }
  }
}

/**
 * Wire a spawned Storybook session into the shared state: stream its output
 * into the terminal-logs channel, record a start failure when the process
 * dies, and clear the session slot so the next start can respawn. `onExit`
 * runs with the dead session after the slot is cleared — the RPC start path
 * uses it to drop the session from the terminals host.
 */
export function adoptStorybookSession(
  state: StorybookDevframeState,
  session: StorybookProcessSession,
  onExit?: (session: StorybookProcessSession) => void,
): void {
  state.storybookSession = session
  const cp = session.getChildProcess()
  if (!cp) return

  const capture = (chunk: Buffer) => {
    for (const line of chunk.toString().split('\n')) {
      if (line) pushTerminalLine(state, line)
    }
  }
  cp.stdout?.on('data', capture)
  cp.stderr?.on('data', capture)

  const drop = () => {
    const dead = state.storybookSession as StorybookProcessSession | null
    state.storybookSession = null
    if (dead) onExit?.(dead)
  }
  cp.on('exit', (code: number | null) => {
    pushTerminalLine(state, `[process exited with code ${code}]`)
    if (code !== 0) {
      state.storybookStartFailure = { code }
      pushTerminalLine(
        state,
        `[error] Storybook failed to start (exit code ${code}). ` +
          'Check that Storybook is installed in this project — ' +
          'see the log above for the underlying error.',
      )
    }
    drop()
  })
  cp.on('error', (err: Error) => {
    state.storybookStartFailure = { code: null }
    pushTerminalLine(state, `[error] Storybook failed to start: ${err.message}`)
    drop()
  })
}
