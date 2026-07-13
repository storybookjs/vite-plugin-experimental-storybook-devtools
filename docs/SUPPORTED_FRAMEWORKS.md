# Supported Frameworks

> React authoring-pattern support matrix (export styles, wrappers, class,
> generics, prop kinds) and documented limitations:
> [docs/REACT_PATTERNS.md](./REACT_PATTERNS.md).


Keep this file up to date whenever framework integrations are added, removed, or significantly changed.

Current integrations:

- React (`src/frameworks/react`) — **React 18 and 19 are both required and
  verified via dedicated E2E playgrounds** (`playground/react` on 19,
  `playground/react18` on 18; Playwright projects `react-chromium` /
  `react18-chromium`). Both playgrounds share ONE source tree —
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
  - **RSC (React Server Components):** opt-in via the `rsc: true` option for
    Vite-based RSC frameworks (e.g. TanStack Start). It enables a `"use client"`
    transform gate so only client components are instrumented; server
    components are left untouched. Covered by the transform unit tests
    (`src/frameworks/react/transform.test.ts` → "RSC mode"). Next.js is not
    Vite, so this plugin does not apply there. See
    [docs/REACT_PATTERNS.md](./REACT_PATTERNS.md) → "React Server Components".
- Vue (`src/frameworks/vue`) — Vue 3 SFCs, verified via a dedicated E2E
  playground (`playground/vue`; Playwright project `vue-chromium`).
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
- Nuxt (uses the Vue integration, `src/frameworks/vue`) — verified via a
  dedicated E2E playground (`playground/nuxt`; Playwright project
  `nuxt-chromium`, port 5176). The playground shares ONE component source tree
  with the Vue playground: `playground/nuxt/app/components` and
  `playground/nuxt/app/assets/style.css` are symlinks into
  `playground/vue/src` (same pattern as react18 ↔ react). Do not replace the
  symlinks with copies.
  - **Plugin registration is client-Vite-only.** Nuxt spins up TWO Vite
    instances (client + SSR) and `vite.plugins` lands in both; the DevTools
    websocket server must exist exactly once. The playground registers
    `DevTools()` + `componentHighlighter()` via the `vite:extendConfig` Nuxt
    hook guarded by `isClient`. (Nuxt 4 bundles Vite 7, vs. Vite 8 in the
    standalone playgrounds — the plugin works on both.)
  - **Head-script injection differs.** Nuxt has no `index.html`, so the
    plugin's `transformIndexHtml` hook never runs. The playground injects
    `getDevToolsHookScript()` (the `__VUE_DEVTOOLS_GLOBAL_HOOK__` bootstrap)
    via `app.head.script` with `tagPriority: -20` so it executes before the
    app entry.
  - **Client modules load via a Nuxt plugin.** `client/listeners`,
    `client/overlay`, AND `@vitejs/devtools/client/inject` (the dock client,
    normally injected by DevTools()'s own `transformIndexHtml`) are imported
    from `app/plugins/storybook-devtools.client.ts` (the `.client` suffix
    keeps them out of any server bundle) instead of a manual `main.ts` entry.
    Without the inject import there is no DevTools client context, so every
    RPC/shared-state feature (panel state sync, tab-active echo) is dead.
  - **DevTools websocket needs explicit host + auth shape.** The websocket
    server binds `config.server.host`, which Nuxt's middleware-mode Vite
    leaves unset → it would bind `localhost` (::1 on macOS) while pages opened
    via 127.0.0.1 connect to 127.0.0.1 and get refused; the playground sets
    `vite.server.host: '127.0.0.1'`. Client auth is read from
    `viteConfig.devtools.config.clientAuth` — Vite 8 normalizes the top-level
    `devtools` user option into that `{ config }` shape but Vite 7 passes it
    through raw, so the playground provides the resolved shape directly
    (`vite.devtools: { config: { clientAuth: false } }`).
  - **The virtual-module import rewrite is base-aware.** Nuxt serves modules
    under base `/_nuxt/`; the plugin's runtime-module loader normalizes
    import-analysis URLs back to bare virtual ids via
    `src/utils/normalize-runtime-imports.ts` (unit-tested), which handles any
    base, not just `/`.
  - **SPA only for now.** The playground sets `ssr: false`; the highlighter
    runtime and client modules are browser-only and SSR evaluation of the
    injected `virtual:component-highlighter/vue-runtime` import is unverified.
    Nuxt DevTools is disabled (`devtools: { enabled: false }`) so it does not
    install a competing Vue devtools hook.
