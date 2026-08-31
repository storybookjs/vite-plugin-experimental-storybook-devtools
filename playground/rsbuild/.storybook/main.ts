import type { StorybookConfig } from '@storybook/react-vite'

// Storybook runs on its own Vite dev server, independent of the app's
// Rsbuild one — the stories live in the shared (symlinked) src tree.
const config: StorybookConfig = {
  stories: ['../src/**/*.stories.@(js|jsx|mjs|ts|tsx)'],
  addons: ['@storybook/addon-docs'],
  framework: '@storybook/react-vite',
}
export default config
