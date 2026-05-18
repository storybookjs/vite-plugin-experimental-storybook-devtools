/// <reference types="vite/client" />

import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { DevTools } from '@vitejs/devtools'

import componentHighlighter from '../../src/frameworks/react/plugin'

const r = (filepath: string) =>
  fileURLToPath(new URL(filepath, import.meta.url))

// Minimal React 18 app used to assert cross-version parity of the
// non-intrusive fiber detection + prop serialization. Mirrors playground/react
// (same components/App) but pinned to React 18.
export default defineConfig({
  devtools: {
    enabled: true,
    clientAuth: false,
  },
  plugins: [
    react(),
    DevTools(),
    componentHighlighter({
      debugMode: true,
    }),
  ],
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
})
