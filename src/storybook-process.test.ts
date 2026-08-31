import { EventEmitter } from 'node:events'
import { describe, expect, it } from 'vitest'
import type { StorybookDevframeState } from './context'
import {
  adoptStorybookSession,
  pushTerminalLine,
  type StorybookProcessSession,
} from './storybook-process'

function buildState(): StorybookDevframeState {
  return {
    server: undefined,
    notifications: { notify: () => {} } as never,
    transformedComponents: new Map(),
    devtoolsTerminals: null,
    storybookSession: null,
    terminalLogSinks: [],
    storybookStartFailure: null,
  }
}

function buildFakeProcess() {
  const cp = new EventEmitter() as EventEmitter & {
    stdout: EventEmitter
    stderr: EventEmitter
  }
  cp.stdout = new EventEmitter()
  cp.stderr = new EventEmitter()
  return cp
}

describe('pushTerminalLine', () => {
  it('fans a line out to every sink and survives a closed one', () => {
    const state = buildState()
    const seen: string[] = []
    state.terminalLogSinks.push(
      {
        write: () => {
          throw new Error('sink closed')
        },
      },
      { write: (line) => seen.push(line) },
    )

    pushTerminalLine(state, 'hello')

    expect(seen).toEqual(['hello'])
  })
})

describe('adoptStorybookSession', () => {
  it('streams stdout/stderr lines and fills the session slot', () => {
    const state = buildState()
    const seen: string[] = []
    state.terminalLogSinks.push({ write: (line) => seen.push(line) })
    const cp = buildFakeProcess()
    const session: StorybookProcessSession = {
      getChildProcess: () => cp as never,
    }

    adoptStorybookSession(state, session)
    expect(state.storybookSession).toBe(session)

    cp.stdout.emit('data', Buffer.from('one\ntwo\n'))
    cp.stderr.emit('data', Buffer.from('warn\n'))

    expect(seen).toEqual(['one', 'two', 'warn'])
  })

  it('records a start failure and clears the slot on a non-zero exit', () => {
    const state = buildState()
    const seen: string[] = []
    state.terminalLogSinks.push({ write: (line) => seen.push(line) })
    const cp = buildFakeProcess()
    const session: StorybookProcessSession = {
      getChildProcess: () => cp as never,
    }
    let exited: StorybookProcessSession | null = null

    adoptStorybookSession(state, session, (dead) => {
      exited = dead
    })
    cp.emit('exit', 1)

    expect(state.storybookSession).toBeNull()
    expect(state.storybookStartFailure).toEqual({ code: 1 })
    expect(exited).toBe(session)
    expect(seen.some((l) => l.includes('exit code 1'))).toBe(true)
  })

  it('leaves no failure recorded on a clean exit', () => {
    const state = buildState()
    const cp = buildFakeProcess()
    adoptStorybookSession(state, { getChildProcess: () => cp as never })

    cp.emit('exit', 0)

    expect(state.storybookSession).toBeNull()
    expect(state.storybookStartFailure).toBeNull()
  })
})
