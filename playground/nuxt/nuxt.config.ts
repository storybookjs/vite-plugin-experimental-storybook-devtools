import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { DevTools } from '@vitejs/devtools'
import { defineNuxtConfig } from 'nuxt/config'

import componentHighlighter, {
  getNuxtDevToolsHookScript,
  getNuxtViteDevToolsInjectionScript,
} from '../../src/frameworks/nuxt/plugin'

const r = (filepath: string) =>
  fileURLToPath(new URL(filepath, import.meta.url))

const isStorybook = process.env.STORYBOOK === 'true'

if (!isStorybook) {
  process.env.VITE_DEVTOOLS_DISABLE_CLIENT_AUTH ??= 'true'
}

export default defineNuxtConfig({
  ssr: true,
  css: ['~/assets/style.css'],
  app: {
    head: {
      script: isStorybook
        ? []
        : [
            {
              innerHTML: getNuxtDevToolsHookScript(),
              tagPosition: 'head',
            },
            {
              type: 'module',
              innerHTML: getNuxtViteDevToolsInjectionScript(),
              tagPosition: 'bodyClose',
            },
          ],
    },
  },
  vite: {
    server: {
      host: '127.0.0.1',
    },
    devtools: {
      enabled: true,
      clientAuth: false,
    },
    plugins: [
      isStorybook ? null : DevTools(),
      isStorybook
        ? null
        : componentHighlighter({
            debugMode: false,
          }),
    ].filter(Boolean),
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
  },
  nitro: {
    preset: 'node-server',
  },
  typescript: {
    strict: true,
    typeCheck: false,
    tsConfig: {
      compilerOptions: {
        types: ['node'],
      },
    },
  },
  alias: {
    '@playground': path.resolve(fileURLToPath(new URL('.', import.meta.url))),
  },
})
