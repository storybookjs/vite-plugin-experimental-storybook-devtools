const GENERIC_DOCS_URL = 'https://storybook.js.org/docs'

/**
 * Framework-specific documentation page per Storybook framework package,
 * matching the links on https://storybook.js.org/docs#supported-frameworks.
 * The Rsbuild frameworks are community-maintained and documented on
 * storybook.rsbuild.rs.
 */
const DOCS_URL_BY_FRAMEWORK: Record<string, string> = {
  '@storybook/react-vite':
    'https://storybook.js.org/docs/get-started/frameworks/react-vite/?renderer=react',
  '@storybook/nextjs':
    'https://storybook.js.org/docs/get-started/frameworks/nextjs/?renderer=react',
  '@storybook/nextjs-vite':
    'https://storybook.js.org/docs/get-started/frameworks/nextjs-vite/?renderer=react',
  '@storybook/vue3-vite':
    'https://storybook.js.org/docs/get-started/frameworks/vue3-vite/?renderer=vue',
  'storybook-react-rsbuild': 'https://storybook.rsbuild.rs/guide/framework/react',
  'storybook-vue3-rsbuild': 'https://storybook.rsbuild.rs/guide/framework/vue',
}

/**
 * Docs URL for a Storybook framework package (e.g. `@storybook/nextjs`),
 * falling back to the general documentation landing page.
 */
export function getStorybookDocsUrl(storybookFramework?: string): string {
  if (!storybookFramework) return GENERIC_DOCS_URL
  return DOCS_URL_BY_FRAMEWORK[storybookFramework] ?? GENERIC_DOCS_URL
}
