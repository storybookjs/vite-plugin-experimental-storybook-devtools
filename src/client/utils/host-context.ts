import type { DevToolsClientContext } from '@vitejs/devtools-kit/client'

/**
 * The devtools client context the host page publishes for in-page code.
 *
 * The embedded dock host (`@devframes/hub`'s client host, which Vite DevTools
 * injects into the app page) publishes it under
 * `__DEVFRAME_HUB_CLIENT_CONTEXT__`; the standalone Vite DevTools viewer uses
 * `__VITE_DEVTOOLS_CLIENT_CONTEXT__`. Check both so this code works wherever
 * the host runs it. Returns `undefined` until the host has initialized.
 */
export function getHostClientContext(): DevToolsClientContext | undefined {
  const w = window as unknown as Record<string, DevToolsClientContext | undefined>
  return (
    w['__VITE_DEVTOOLS_CLIENT_CONTEXT__'] ?? w['__DEVFRAME_HUB_CLIENT_CONTEXT__']
  )
}
