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
import { DEVTOOLS_MOUNT_PATH } from '@vitejs/devtools-kit/constants'
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
 *
 * devframe 0.9 / devtools-kit 0.6 replaced the old
 * `virtual:vite-devtools-injection` module with the hub-ui embedded bootstrap
 * served at `<mountPath>embedded.js`. Mirror @vitejs/devtools' own injection
 * plugin: create the module `<script>` at runtime so the host build never
 * processes the hub-served asset (keeps its `import.meta.url`-relative fetches
 * intact).
 */
export function getNuxtViteDevToolsInjectionScript(
  mountPath: string = DEVTOOLS_MOUNT_PATH,
): string {
  const base = mountPath.endsWith('/') ? mountPath : `${mountPath}/`
  const src = `${base}embedded.js`
  return `const s = document.createElement('script'); s.type = 'module'; s.src = ${JSON.stringify(
    src,
  )}; document.body.appendChild(s);`
}

export type { ComponentHighlighterOptions } from '../../create-component-highlighter-plugin'
