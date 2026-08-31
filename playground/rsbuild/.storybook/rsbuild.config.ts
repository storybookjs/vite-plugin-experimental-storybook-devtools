import { defineConfig } from '@rsbuild/core'
import { pluginReact } from '@rsbuild/plugin-react'

// Storybook-only Rsbuild config (see rsbuildConfigPath in main.ts). The
// app's rsbuild.config.ts mounts the devtools plugin and the app entry —
// neither belongs in Storybook's own build, and keeping Storybook's config
// scanner out of the plugin's source tree avoids a wall of
// extensionless-import warnings only a bundler can resolve.
export default defineConfig({
  plugins: [pluginReact()],
})
