/**
 * Unified Vite Entry Point
 *
 * Import this to use the component highlighter with Vite, picking the
 * framework via the `framework` option:
 * ```ts
 * import { storybookDevtools } from 'vite-plugin-experimental-storybook-devtools/vite'
 * ```
 */

import {
  createComponentHighlighterPlugin,
  type ComponentHighlighterOptions,
} from './create-component-highlighter-plugin'
import { reactFramework } from './frameworks/react'
import { vueFramework } from './frameworks/vue'

export type { ComponentHighlighterOptions } from './create-component-highlighter-plugin'

/**
 * Component Highlighter Vite Plugin
 *
 * @example
 * ```ts
 * // vite.config.ts
 * import { defineConfig } from 'vite'
 * import react from '@vitejs/plugin-react'
 * import { DevTools } from '@vitejs/devtools'
 * import { storybookDevtools } from 'vite-plugin-experimental-storybook-devtools/vite'
 *
 * export default defineConfig({
 *   plugins: [
 *     react(),
 *     DevTools(),
 *     storybookDevtools({ framework: 'react' }),
 *   ],
 * })
 * ```
 */
export function storybookDevtools(
  options: ComponentHighlighterOptions & { framework: 'react' | 'vue' },
) {
  const { framework: frameworkName, ...pluginOptions } = options
  const framework =
    frameworkName === 'vue' ? vueFramework : reactFramework
  return createComponentHighlighterPlugin(framework, pluginOptions)
}
