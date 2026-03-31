import { defineConfig } from 'vite'

export default defineConfig({
  root: 'src/panel',
  base: '/.storybook-devtools/',
  build: {
    outDir: '../../dist/panel',
    emptyOutDir: true,
    rollupOptions: {
      onwarn(warning, defaultHandler) {
        // Suppress FILE_NAME_CONFLICT during watch rebuilds
        if (warning.code === 'FILE_NAME_CONFLICT') return
        defaultHandler(warning)
      },
    },
  },
})
