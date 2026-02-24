import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: [
    'src/index.ts',
    'src/frameworks/react/plugin.ts',
    'src/frameworks/vue/plugin.ts',
    'src/frameworks/react/runtime-module.ts',
    'src/frameworks/vue/runtime-module.ts',
    'src/runtime-helpers.ts',
    'src/client/listeners.ts',
    'src/client/overlay.ts',
    'src/client/vite-devtools.ts',
  ],
  format: ['esm'],
  dts: true,
  external: [
    'vite',
    '@vitejs/devtools-kit',
    '@babel/parser',
    '@babel/traverse',
    '@babel/generator',
    '@babel/types',
    '@vue/compiler-sfc',
    'vue',
    'react',
    'virtual:component-highlighter/runtime-helpers',
  ],
})
