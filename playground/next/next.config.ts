import type { NextConfig } from 'next'
import { fileURLToPath } from 'node:url'
import { withStorybookDevtools } from 'vite-plugin-experimental-storybook-devtools/next'

const r = (filepath: string) => fileURLToPath(new URL(filepath, import.meta.url))

const nextConfig: NextConfig = {
  // Next's App Router treats any path segment starting with `_` as a
  // private, unroutable folder — including the double-underscore
  // `__devframes` / `__storybook-devtools-client` convention the devframes
  // hub and its client-bundle route use. The actual route handlers live at
  // non-underscore paths and get rewritten to their public URLs here.
  async rewrites() {
    return [
      { source: '/__devframes/:path*', destination: '/internal-devframes-hub/:path*' },
      {
        source: '/__storybook-devtools-client/:path*',
        destination: '/internal-devframes-client/:path*',
      },
    ]
  },
  webpack(config) {
    // The playground eagerly imports client/listeners + client/overlay for
    // deterministic E2E activation (like the Vite playgrounds' index.tsx).
    // Aliasing both to a shim that imports the dock's self-contained bundle
    // by URL — instead of bundling dist/client/listeners.mjs +
    // dist/client/overlay.mjs directly — keeps the eagerly-loaded client and
    // the embedded-dock-loaded client as ONE shared browser module instance
    // (the browser's ES module cache dedupes by resolved URL). Bundling both
    // paths separately would register two independent registries/overlays.
    config.resolve ??= {}
    config.resolve.alias = {
      ...(config.resolve.alias as Record<string, string> | undefined),
      'vite-plugin-experimental-storybook-devtools/client/listeners': r(
        './shims/devtools-client.ts',
      ),
      'vite-plugin-experimental-storybook-devtools/client/overlay': r(
        './shims/empty.ts',
      ),
    }
    return config
  },
}

export default withStorybookDevtools({
  debugMode: true,
})(nextConfig)
