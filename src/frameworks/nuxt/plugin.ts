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

/**
 * Nuxt module that makes Vite DevTools reachable in dev.
 *
 * Vite DevTools serves everything — the hub UI and RPC endpoints under
 * `/__devtools/`, per-plugin panels such as `/__storybook-devtools/`, and the
 * `/@id/*` client-script resolution — as connect middleware and module URLs on
 * the client Vite server. Nuxt does pipe every dev request through that
 * middleware stack, but marks non-build-asset requests with `_skip_transform`
 * and rewrites their URL onto `/__skip_vite/*` partway down the stack, so the
 * devtools middlewares (and Vite's transform pipeline) never match them and
 * the request falls through to Nitro's SSR catch-all.
 *
 * This module prepends one middleware to the client Vite stack that undoes
 * that for devtools traffic: it clears the skip flag on devtools-owned paths,
 * and additionally rewrites module-graph URLs (`/@id/*` and the dock imports
 * virtual id, which the devtools host advertises without a base) onto Vite's
 * `buildAssetsDir` base so the transform pipeline serves them.
 *
 * The RPC WebSocket needs no bridging: with Vite in middleware mode the
 * devtools hub starts a sidecar WebSocket server on its own port and
 * advertises it through `__connection.json`.
 *
 * Usage in `nuxt.config.ts`: `modules: [viteDevToolsBridgeModule]`.
 */
export function viteDevToolsBridgeModule(
  _inlineOptions: unknown,
  // Minimal structural slice of the Nuxt instance; avoids a @nuxt/kit dependency.
  nuxt: {
    options: { dev?: boolean }
    hook: (name: string, fn: (...args: never[]) => void) => void
  },
): void {
  if (!nuxt.options.dev) return

  // Paths served by devtools connect middlewares at their full path (the hub
  // base and every hostStatic mount, this plugin's panel included).
  const devtoolsPrefixes = ['/__devtools', '/__devframes', '/__storybook-devtools']
  // Module-graph URLs the devtools host advertises without Vite's base.
  const moduleUrlPrefixes = ['/@id/', '/__devtools-client-imports.js']

  type ConnectLayer = {
    route: string
    handle: (req: unknown, res: unknown, next: (err?: unknown) => void) => void
  }
  type NodeMiddlewareServer = {
    config: { base: string }
    middlewares: { stack: ConnectLayer[] }
  }

  ;(
    nuxt.hook as (
      name: 'vite:serverCreated',
      fn: (server: NodeMiddlewareServer, ctx: { isClient: boolean }) => void,
    ) => void
  )('vite:serverCreated', (server, ctx) => {
    if (!ctx.isClient) return
    const base = server.config.base.replace(/\/$/, '')
    server.middlewares.stack.unshift({
      route: '',
      handle: (req: unknown, _res: unknown, next: (err?: unknown) => void) => {
        const r = req as { url?: string; _skip_transform?: boolean }
        const url = r.url ?? ''
        if (devtoolsPrefixes.some((p) => url.startsWith(p))) {
          r._skip_transform = false
        } else if (moduleUrlPrefixes.some((p) => url.startsWith(p))) {
          r._skip_transform = false
          r.url = `${base}${url}`
        }
        next()
      },
    })
  })
}

export type { ComponentHighlighterOptions } from '../../create-component-highlighter-plugin'
