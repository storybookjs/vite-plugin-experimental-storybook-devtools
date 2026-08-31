import type { StorybookConfig } from 'storybook-react-rsbuild'

// The Rsbuild Storybook framework (storybook.rsbuild.rs): the builder loads
// this playground's rsbuild.config.ts, so the devtools plugin there is gated
// behind the STORYBOOK env var (set by the storybook script and the panel's
// start-storybook spawn). Stories live in the shared (symlinked) src tree.
// @storybook/react is a direct devDependency: the rspack builder resolves
// the renderer's preview annotations from the project root, and pnpm's
// strict layout doesn't expose the framework's transitive copy — without it
// the preview boots without renderToCanvas and every story errors.
const config: StorybookConfig = {
  stories: ['../src/**/*.stories.@(js|jsx|mjs|ts|tsx)'],
  addons: ['@storybook/addon-docs'],
  framework: 'storybook-react-rsbuild',
}
export default config
