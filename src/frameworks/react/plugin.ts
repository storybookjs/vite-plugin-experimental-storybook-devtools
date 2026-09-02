/**
 * React Entry Point
 *
 * Import this to use the component highlighter with React:
 * ```ts
 * import componentHighlighter from '@storybook/experimental-devtools/react'
 * ```
 */

import { createComponentHighlighterPlugin, type ComponentHighlighterOptions } from '../../create-component-highlighter-plugin'
import { reactFramework } from '.'

/**
 * React Component Highlighter Plugin
 *
 * @example
 * ```ts
 * // vite.config.ts
 * import { defineConfig } from 'vite'
 * import react from '@vitejs/plugin-react'
 * import { DevTools } from '@vitejs/devtools'
 * import componentHighlighter from '@storybook/experimental-devtools/react'
 *
 * export default defineConfig({
 *   plugins: [
 *     react(),
 *     DevTools(),
 *     componentHighlighter(),
 *   ],
 * })
 * ```
 */
export default function componentHighlighterReact(options: ComponentHighlighterOptions = {}) {
  return createComponentHighlighterPlugin(reactFramework, options)
}

// Re-export types
export type { ComponentHighlighterOptions } from '../../create-component-highlighter-plugin'
export { reactFramework } from '.'

