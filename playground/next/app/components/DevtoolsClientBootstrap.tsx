'use client'

// Eager client-module load for deterministic E2E activation — mirrors
// playground/react/src/index.tsx's eager imports. next.config.ts aliases
// both subpaths to shims/devtools-client.ts + shims/empty.ts so this loads
// the dock's self-contained client bundle by URL instead of bundling
// dist/client/listeners.mjs + dist/client/overlay.mjs directly (real
// consuming apps import neither — the embedded dock loads the client lazily
// once DevTools connects).
import 'vite-plugin-experimental-storybook-devtools/client/listeners'
import 'vite-plugin-experimental-storybook-devtools/client/overlay'

export function DevtoolsClientBootstrap() {
  return null
}
