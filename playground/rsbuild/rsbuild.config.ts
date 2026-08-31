import { fileURLToPath } from 'node:url'
import { defineConfig } from '@rsbuild/core'
import { pluginReact } from '@rsbuild/plugin-react'
import storybookDevtoolsRsbuild from '../../src/rsbuild'

const r = (filepath: string) => fileURLToPath(new URL(filepath, import.meta.url))

export default defineConfig({
  plugins: [
    pluginReact(),
    // Storybook's rsbuild builder loads this config too — the devtools
    // plugin must not mount inside Storybook's own dev server.
    process.env.STORYBOOK
      ? null
      : storybookDevtoolsRsbuild({
          framework: 'react',
          debugMode: true,
          clientAuth: false,
        }),
  ].filter(Boolean),
  source: { entry: { index: './src/index.tsx' } },
  html: { mountId: 'app' },
  server: { host: '127.0.0.1', port: 5177 },
  resolve: {
    alias: {
      'vite-plugin-experimental-storybook-devtools/client/listeners': r(
        './shims/devtools-client.ts',
      ),
      'vite-plugin-experimental-storybook-devtools/client/overlay': r(
        './shims/empty.ts',
      ),
    },
  },
})
