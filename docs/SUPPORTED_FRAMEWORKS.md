# Supported Frameworks

> React authoring-pattern support matrix (export styles, wrappers, class,
> generics, prop kinds) and documented limitations:
> [docs/REACT_PATTERNS.md](./REACT_PATTERNS.md).


Keep this file up to date whenever framework integrations are added, removed, or significantly changed.

## Bundler hosts

Support is a (framework × host) matrix, not just a framework list:

| | Vite | Rsbuild (rspack) | Next.js (webpack) |
|---|---|---|---|
| React | verified (18 + 19, `playground/react` + `playground/react18`) | verified (19, `playground/rsbuild`) | verified (19, `playground/next`, App Router + RSC) |
| Vue | verified (`playground/vue`) | accepted, not playground/E2E-verified | n/a |
| Nuxt SSR | verified (`playground/nuxt`) — rides the Vue integration on Vite | n/a — Nuxt is a Vite framework | n/a |

Vite is mounted via `./react`, `./vue`, or the unified `./vite` entry, with the
dock delivered through `@vitejs/devtools`. Rsbuild is mounted via the
`./rsbuild` entry (`storybookDevtoolsRsbuild({ framework })`), with the dock
delivered through a bundled `@devframes/hub` instance instead — see the
"Rsbuild (rspack)" section in the README for setup and host-specific options
(`clientAuth`, dev-time runtime sourcing). Next.js is mounted via the `./next`
entry (`withStorybookDevtools()` composing `next.config.ts`, plus two route
handlers the consuming app creates — `createStorybookDevtoolsRoute()` for the
devframes hub and `createStorybookDevtoolsClientBundleRoute()` for the dock's
client bundle) — see the "Next.js (webpack)" section in the README for setup,
the required `rewrites()` mapping, and host-specific options (`auth`, `host`,
Turbopack unsupported, RSC gate).

Current integrations:

- React (`src/frameworks/react`) — **React 18 and 19 are both required and
  verified via dedicated E2E playgrounds** (`playground/react` on 19,
  `playground/react18` on 18; Playwright projects `react-chromium` /
  `react18-chromium`). Also verified on the Rsbuild host (`playground/rsbuild`,
  React 19, Playwright project `rsbuild-chromium`), which shares the same
  source tree as `playground/react`, and on the Next.js host (`playground/next`,
  React 19, App Router, Playwright project `next-chromium`), which has its own
  source tree since it exercises the RSC gate in `rsc: true` mode (server and
  client components mixed) rather than the `rsc: false` SPA shape the other
  playgrounds share. Both Vite playgrounds share ONE source tree —
  `playground/react18/src` is a symlink to `playground/react/src` — so
  components are authored once and exercised on both React versions.
  Detection is non-intrusive: it reads the live fiber
  tree through the React DevTools global hook and never wraps components. It
  relies only on the reconciler hook contract (identical, typeof-guarded
  across 16.9–19) and fiber fields stable since React 16 (`current/child/
  sibling/type/elementType/memoizedProps/stateNode/alternate`). It
  deliberately does **not** use `_debugSource` (removed in React 19) — exact
  source identity comes from the build-time `__chRegisterMeta` tag, so 18 and
  19 behave identically.
  - Prop-serialization fidelity is part of the React-18 contract. The bundled
    `react-element-to-jsx-string` must bind the *app's* React, else its
    `React.isValidElement` rejects React 18 elements and props degrade to a
    "Failed to serialize" placeholder. The `dedupeReact` option (default
    `'auto'`) adds `react`/`react-dom` to `resolve.dedupe` **only when a
    React-major mismatch is detected** — so React 19 apps get no config
    mutation while React 18 apps are fixed automatically (`false` opts out
    with a warning; never silent). The `react18-chromium` spec asserts no
    degraded fallback and real JSX children source.
  - **RSC (React Server Components):** the `rsc` option enables a `"use client"`
    transform gate so only client components are instrumented; server
    components are left untouched, and a module that is client-side only
    *transitively* (imported by a `"use client"` module but carrying no
    directive of its own) is not instrumented either. Opt-in (default `false`)
    for Vite-based RSC frameworks (e.g. TanStack Start); on the Next.js host
    it defaults to `true`, since the App Router ships Server Components by
    default. The transform gate itself is covered by unit tests
    (`src/frameworks/react/transform.test.ts` → "RSC mode"); `playground/next`
    (App Router, mixed server + client components) provides runtime RSC
    coverage — `e2e/playground-next-detection.spec.ts` asserts the client
    component set registers and that a server component (`ServerInfo`) never
    appears in the registry despite rendering server-only content. See
    [docs/REACT_PATTERNS.md](./REACT_PATTERNS.md) → "React Server Components".
- Vue (`src/frameworks/vue`) — Vue 3 SFCs, verified on the Vite host via a
  dedicated E2E playground (`playground/vue`; Playwright project
  `vue-chromium`). The Rsbuild adapter accepts `framework: 'vue'`, but it has
  no playground or E2E coverage — treat Vue-on-Rsbuild as unverified.
  Detection is **non-intrusive**, mirroring React: an inline `<head>` script
  (`src/frameworks/vue/devtools-hook.ts`) installs a minimal
  `__VUE_DEVTOOLS_GLOBAL_HOOK__` *before* the app's `createApp` runs, and the
  runtime (`src/frameworks/vue/runtime-module.ts`) subscribes to Vue's
  `component:added` / `component:updated` / `component:removed` devtools events
  to reconcile the registry. Components are **never wrapped** and the SFC is
  **never reconstructed**.
  - **Source identity is native.** Component name and absolute path come from
    Vue's own `instance.type.__name` / `instance.type.__file`, which
    `@vitejs/plugin-vue` stamps onto SFC component objects in dev. No metadata
    is injected.
  - **The transform is a one-line, idempotent tag.** It only prepends a
    side-effect `import 'virtual:component-highlighter/vue-runtime'` to the
    SFC's existing `<script setup>` / `<script>` block (so the runtime module
    loads, and the plugin's coverage tracking still sees a transformed module).
    The original script body, template, styles, and any other blocks are
    preserved byte-for-byte. Options-API and dual-`<script>` SFCs no longer
    lose their non-`setup` `<script>` block (the previous reconstruction
    silently dropped it).
  - **Unmount tracking requires `cleanupBuffer`.** `@vue/runtime-core` only
    emits `component:removed` when the global hook exposes a
    `cleanupBuffer(component)` method returning falsy. The installed hook
    provides one returning `false` (it never buffers — it is installed before
    the app). Without it, unmounts are silently dropped.
  - **Live prop editing works** (parity with React). Vue has no
    `overrideProps` renderer API, but the instance's internal `props` object
    is shallow-reactive in dev — assigning a top-level key re-renders the
    component (the same mechanism the official Vue DevTools prop editor
    uses). Nested paths clone-and-reassign the top-level prop, and only
    declared props are editable (slot pseudo-props and listeners are
    rejected). The shared machinery (payload decoding, reset-to-original
    snapshots, registry sync) lives in `runtime-helpers.ts` →
    `createLivePropEditor`. Covered by `e2e/common-live-prop-edit-suite.ts`
    with Vue-specific data-type targets (including a nested
    `['task','title']` json edit).
- Nuxt SSR (`playground/nuxt`; Playwright project `nuxt-chromium`) — verified
  as an SSR consumer of the Vue integration. Nuxt uses
  `src/frameworks/nuxt/plugin.ts`, which returns the Vue Vite plugin and
  exports `getNuxtDevToolsHookScript()` and
  `getNuxtViteDevToolsInjectionScript()` for `nuxt.config.ts` head injection.
  The explicit scripts are required because Nuxt does not depend on Vite's
  `transformIndexHtml` path for its SSR HTML; the Vue devtools hook must exist
  before hydration mounts the client app, and the Vite DevTools dock script
  must be imported explicitly. The playground pins `vite.server.host` to
  `127.0.0.1` so the page and DevTools websocket use the same host in live and
  E2E runs. The Vite transform still skips SSR module transforms, so the
  browser-only runtime is imported only by the hydrated client graph.
  SSR + hydration integrity is verified by `e2e/common-ssr-suite.ts` on both
  SSR hosts (Nuxt and Next.js) against each playground's `HydrationInfo`
  component, which renders server-computed state (Nuxt `useState` payload
  transfer; a Next server-component prop): the markup must be in the raw HTML
  payload, hydration must complete without mismatch errors while
  instrumentation is active, and the hydrated instance must appear in the
  highlighter registry.

  **Known limitation (devframe 0.9 / devtools-kit 0.6):** the embedded
  DevTools **dock UI does not load under Nuxt SSR**. 0.6 serves the dock from a
  connect-middleware route (`/__devtools/embedded.js`) instead of the old Vite
  module-graph virtual module, and Nuxt's Nitro server does not forward
  `/__devtools/*` to Vite's middleware. The in-page component
  highlighter/overlay and RPC still work; only the dock panel is affected. The
  corresponding E2E test is skipped. Restoring the dock is tracked Nuxt
  host-adapter work — see `docs/DEVFRAME_MIGRATION.md`
  (Phase 1 → Nuxt SSR dock follow-up).
