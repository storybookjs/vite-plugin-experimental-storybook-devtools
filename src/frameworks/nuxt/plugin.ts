/**
 * Nuxt Entry Point
 *
 * Nuxt runs Vue through Vite, so component instrumentation reuses the Vue
 * framework implementation. SSR apps also need the Vue devtools hook installed
 * through Nuxt's head before the client bundle hydrates, because Nuxt does not
 * rely on Vite's index.html transform path.
 */

import componentHighlighterVue from '../vue/plugin'
import { getDevToolsHookScript } from '../vue/devtools-hook'
import type { ComponentHighlighterOptions } from '../../create-component-highlighter-plugin'

/**
 * Vite plugin for Nuxt's `vite.plugins` array.
 */
export default function componentHighlighterNuxt(
  options: ComponentHighlighterOptions = {},
) {
  return componentHighlighterVue(options)
}

/**
 * Inline script body for `app.head.script[].innerHTML` in `nuxt.config.ts`.
 * Install it only outside Storybook so Storybook's preview app stays isolated.
 */
export function getNuxtDevToolsHookScript(): string {
  return getDevToolsHookScript()
}

/**
 * Nuxt SSR does not pass the rendered document through Vite's
 * transformIndexHtml hook, so @vitejs/devtools cannot inject its embedded dock
 * script by itself. Add this module script to Nuxt's head in dev.
 */
export function getNuxtViteDevToolsInjectionScript(
  buildAssetsDir = '/_nuxt/',
): string {
  const assetsDir = buildAssetsDir.endsWith('/')
    ? buildAssetsDir
    : `${buildAssetsDir}/`

  return `import ${JSON.stringify(
    `${assetsDir}@id/__x00__virtual:vite-devtools-injection`,
  )}`
}

export type { ComponentHighlighterOptions } from '../../create-component-highlighter-plugin'
