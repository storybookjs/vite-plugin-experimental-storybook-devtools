/**
 * Loads the highlighter client modules (browser-only). In the Vite SPA
 * playgrounds these are imported from `src/main.ts`; Nuxt has no manual
 * entry, so a `.client` plugin is the equivalent injection point.
 *
 * The Vite DevTools dock client is normally injected by DevTools()'s
 * transformIndexHtml hook, which Nuxt never runs (no index.html) — import it
 * explicitly so the RPC/shared-state channel the highlighter relies on works.
 */
import '@vitejs/devtools/client/inject'
import 'vite-plugin-experimental-storybook-devtools/client/listeners'
import 'vite-plugin-experimental-storybook-devtools/client/overlay'

export default defineNuxtPlugin(() => {})
