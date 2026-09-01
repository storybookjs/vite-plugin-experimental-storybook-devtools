import { describe, expect, it } from 'vitest'
import { getStorybookDocsUrl } from './storybook-docs-url'

describe('getStorybookDocsUrl', () => {
  it('maps each supported framework to its docs page', () => {
    expect(getStorybookDocsUrl('@storybook/react-vite')).toBe(
      'https://storybook.js.org/docs/get-started/frameworks/react-vite/?renderer=react',
    )
    expect(getStorybookDocsUrl('@storybook/nextjs')).toBe(
      'https://storybook.js.org/docs/get-started/frameworks/nextjs/?renderer=react',
    )
    expect(getStorybookDocsUrl('@storybook/vue3-vite')).toBe(
      'https://storybook.js.org/docs/get-started/frameworks/vue3-vite/?renderer=vue',
    )
    expect(getStorybookDocsUrl('storybook-react-rsbuild')).toBe(
      'https://storybook.rsbuild.rs/guide/framework/react',
    )
  })

  it('falls back to the docs landing page for unknown or missing frameworks', () => {
    expect(getStorybookDocsUrl('@storybook/angular')).toBe(
      'https://storybook.js.org/docs',
    )
    expect(getStorybookDocsUrl(undefined)).toBe('https://storybook.js.org/docs')
  })
})
