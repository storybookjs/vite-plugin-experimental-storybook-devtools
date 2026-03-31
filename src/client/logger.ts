/**
 * Client-side debug logger for the component highlighter.
 *
 * Debug output is silenced by default. Enable it by setting
 * `window.__componentHighlighterDebug = true` in the console
 * or by using the plugin's `debugMode: true` option (which sets
 * the flag automatically via the runtime module).
 *
 * Errors and warnings always log regardless of the debug flag.
 */

declare global {
  interface Window {
    __componentHighlighterDebug?: boolean
  }
}

const PREFIX = '[component-highlighter]'

function isDebugEnabled(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.__componentHighlighterDebug === true
  )
}

export function debug(...args: unknown[]): void {
  if (isDebugEnabled()) {
    console.log(PREFIX, ...args)
  }
}

export function warn(...args: unknown[]): void {
  console.warn(PREFIX, ...args)
}

export function error(...args: unknown[]): void {
  console.error(PREFIX, ...args)
}
