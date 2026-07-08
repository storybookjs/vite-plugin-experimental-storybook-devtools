import { fileURLToPath } from 'node:url'
import { DevTools } from '@vitejs/devtools'

import componentHighlighter from '../../src/frameworks/vue/plugin'
import { getDevToolsHookScript } from '../../src/frameworks/vue/devtools-hook'

const r = (filepath: string) =>
  fileURLToPath(new URL(filepath, import.meta.url))

export default defineNuxtConfig({
 
  devtools: { enabled: false },

  compatibilityDate: '2026-07-07',

  css: ['~/assets/style.css'],

  app: {
    head: {
      title: 'Nuxt Components Starter',
      script: [
        {
          innerHTML: getDevToolsHookScript(),
          type: 'text/javascript',
          tagPosition: 'head',
          tagPriority: -20,
        },
      ],
    },
  },
 

  vite: {
 
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
    plugins: [
      componentHighlighter(),
      DevTools(),
    ],
  },
})
