/// <reference types="vitest/config" />
/// <reference types="vite/client" />

import path from 'node:path'
import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { DevTools } from '@vitejs/devtools'
import { storybookTest } from '@storybook/addon-vitest/vitest-plugin'
import { playwright } from '@vitest/browser-playwright'

import componentHighlighter from '../../src/frameworks/react/plugin'

const r = (filepath: string) =>
  fileURLToPath(new URL(filepath, import.meta.url))

const dirname =
  typeof __dirname !== 'undefined'
    ? __dirname
    : path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  plugins: [
    react(),
    process.env.STORYBOOK || process.env.E2E ? null : DevTools(),
    process.env.STORYBOOK
      ? null
      : componentHighlighter({
          debugMode: true,
        }),
  ].filter(Boolean),
  build: {
    rolldownOptions: {
      devtools: {}, // enable devtools mode
    },
  },
  resolve: {
    alias: {
      'vite-plugin-experimental-storybook-devtools/client/listeners': r(
        '../../src/client/listeners.ts',
      ),
      'vite-plugin-experimental-storybook-devtools/client/overlay': r(
        '../../src/client/overlay.ts',
      ),
      'vite-plugin-experimental-storybook-devtools/client/vite-devtools': r(
        '../../src/client/vite-devtools.ts',
      ),
    },
  },
  // @ts-expect-error the triple slash should work, check later
  test: {
    plugins: [
      storybookTest({
        configDir: path.join(dirname, '.storybook'),
      }),
    ],
    test: {
      name: 'storybook',
      browser: {
        enabled: true,
        headless: true,
        provider: playwright({}),
        instances: [
          {
            browser: 'chromium',
          },
        ],
      },
      setupFiles: ['.storybook/vitest.setup.ts'],
    },
  },
})
