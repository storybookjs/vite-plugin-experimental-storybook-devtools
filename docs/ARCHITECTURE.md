# Architecture

Reference for contributors and coding agents.

## What this plugin does

`@storybook/experimental-devtools` tracks rendered components in
dev, overlays highlights in the browser, and generates Storybook stories from
runtime props. It supports React, Vue, and Nuxt SSR (via the Vue
integration), on three bundler hosts: Vite (`./react`, `./vue`, `./vite`;
Nuxt rides this), Rsbuild/rspack (`./rsbuild`), and Next.js/webpack
(`./next`, React only).

See `docs/SUPPORTED_FRAMEWORKS.md` for the current framework list.

## Runtime flow

The plugin has six stages: bundler setup, a build-time transform, a browser
runtime, an overlay + listeners layer, a DevTools panel, and server-side
story generation.

### 1. Plugin setup

`src/unplugin.ts` is the portable instrumentation core, built on `unplugin`.
It owns the transform pipeline (filter → `framework.detect` →
`framework.transform`), coverage tracking, diagnostics dedupe, and virtual
module resolution. Each bundler host (below) wraps it with its own adapter.

`src/hub-setup.ts` registers the hub surfaces shared by all three hosts:
notifications, diagnostics, the terminals reference, the
`component-highlighter` action dock, and the Mod+K commands.

`src/react-dedupe.ts` detects a React-major mismatch between the app and
this plugin's own `react-element-to-jsx-string` dependency, and decides
whether to add `react`/`react-dom` to the bundler's dedupe list.

`src/devframe.ts` defines the `storybook-devtools` devframe: it registers
the RPC surface and shared state, and serves the panel as `clientAssets`.

### 2. Framework transform

`src/frameworks/<fw>/transform.ts` runs at build time. Neither transform
wraps components.

- **React**: a Babel AST transform (Babel re-exported from
  `storybook/internal/babel`, not a direct dependency) that appends one
  idempotent call,
  `__chRegisterMeta(Component, { componentName, filePath,
  relativeFilePath, sourceId, isDefaultExport })`. The fiber tree is
  untouched.
- **Vue**: prepends one side-effect import,
  `import 'virtual:component-highlighter/vue-runtime'`, to the
  `<script setup>`/`<script>` block. Everything else is preserved
  byte-for-byte. Source identity is read at runtime from Vue's own
  `instance.type.__file`/`__name`.

Both report non-fatal detection gaps through `TransformOptions.onIssue`,
surfaced as DevTools diagnostics.

### 3. Browser runtime

`src/frameworks/<fw>/runtime-module.ts` and `src/runtime-helpers.ts` run in
the browser. The devtools hook script must reach the page before the
framework's renderer registers, via one of two `hookInjection` modes:
`'html'` (default, Vite only — `transformIndexHtml` head-prepends it) or
`'entry'` (prepended to the app's entry module, matched by the `entry`
option).

- **React**: `src/frameworks/react/devtools-hook.ts` installs a minimal
  `__REACT_DEVTOOLS_GLOBAL_HOOK__` before react-dom registers. The runtime
  module subscribes via `window.__chInstallCommitHandler` and walks the
  live fiber tree on every commit, reading the `__chRegisterMeta` tag off
  `fiber.type`/`elementType`.
- **Vue**: `src/frameworks/vue/devtools-hook.ts` installs a minimal
  `__VUE_DEVTOOLS_GLOBAL_HOOK__` before `createApp` runs. The runtime
  module subscribes via `window.__chInstallVueHandler` to Vue's
  `component:added`/`updated`/`removed` events, keyed per instance in a
  `WeakMap`. The hook must expose `cleanupBuffer()` (returning `false`), or
  `@vue/runtime-core` never emits `component:removed`.
- **Nuxt SSR**: `src/frameworks/nuxt/plugin.ts` reuses the Vue Vite plugin,
  exposing `getNuxtDevToolsHookScript()` for `nuxt.config.ts` to inject
  before hydration, plus a `viteDevToolsBridgeModule` Nuxt module that
  makes the DevTools HTTP surface reachable through Nuxt's dev server.

The runtime registers instances in a `Map` on `window`, tracks props and DOM
anchors, and emits `component-highlighter:register`/`unregister`/
`update-props` events. Because the listeners module can load after the
first commit, the runtime replays its full registry when
`component-highlighter:listeners-ready` fires.

### 4. Overlay + listeners

`src/client/overlay.ts`, `src/client/listeners.ts`, and
`src/client/context-menu.ts` run in the browser page, connecting to the
host-published client context via `getHostClientContext()` — separate from
the panel, which connects as its own devframe SPA. `listeners.ts` dispatches
`component-highlighter:listeners-ready` once attached, triggering the
runtime replay above. It renders highlight rectangles in
`#component-highlighter-container`, handles hover/click/keyboard shortcuts,
and drives the Shadow DOM context menu. `src/client/interaction-recorder.ts`
captures user actions as play-function steps for "Create with Interactions".

### 5. DevTools panel

`src/panel/panel.ts` is served as the devframe's `clientAssets` SPA at
`/__storybook-devtools/`. Four tabs: Storybook (embedded iframe), Coverage
(dashboard, bulk "Create all"), Terminal (process output), Docs. Story
navigation uses the Storybook channel API
(`__STORYBOOK_ADDONS_CHANNEL__.emit('setCurrentStory')`).

### 6. Story generation (server)

`src/frameworks/<fw>/story-generator.ts` receives a payload over RPC,
generates framework-specific story source (React `.stories.tsx`, Vue
`.stories.ts`), writes or appends the file, and broadcasts
`component-highlighter:story-created` back to the client.

## Bundler hosts

| Host | Entry file | Instrumentation mount | Hook delivery | Dock/panel serving |
|------|-----------|------------------------|---------------|---------------------|
| Vite | `src/create-component-highlighter-plugin.ts` | `unplugin.vite()`, plus Vite-only hooks (`config`, `configResolved`, `configureServer`, `transformIndexHtml`, `handleHotUpdate`) | `'html'` via `transformIndexHtml`, or `'entry'` | devframe mounted through Vite's own dev server; dock client resolved via Vite's `/@id/{specifier}` |
| Rsbuild | `src/rsbuild.ts` (`storybookDevtoolsRsbuild`) | `unplugin.rspack()` in `modifyRspackConfig` | Devtools-hook script and dock bootstrap injected via `modifyHTMLTags` | `@devframes/hub` mounted on the dev server's Connect middlewares in `onBeforeStartDevServer`, over a sidecar WebSocket; dock client bundle served from `dist/client-bundled/` at `/__storybook-devtools-client/vite-devtools.mjs` |
| Next.js | `src/next.ts` (`withStorybookDevtools`) | `unplugin.webpack()` in `next.config.ts`'s `webpack()`, restricted to the dev client compilation | `'entry'` only, targeting Next's client bootstrap modules | Two route handlers a consuming app mounts: `createStorybookDevtoolsRoute()` (hub over a sidecar WebSocket) and `createStorybookDevtoolsClientBundleRoute()` (same client-bundle URL convention as Rsbuild); both exposed via `next.config.ts` `rewrites()` since App Router treats leading-underscore paths as private |

Notes:

- Rsbuild has no equivalent of Vite's `server.transformRequest`, so its
  runtime-helpers and framework virtual modules always read from built
  `dist/` — run `pnpm build` before using it.
- Next has no unplugin adapter for Turbopack: `withStorybookDevtools` warns
  and no-ops under `process.env.TURBOPACK` instead of crashing.
- Next's RSC gate (see Invariants) defaults to `true`; it targets
  `@storybook/nextjs` only.

## Server RPC surface

There is no HTTP middleware. Every server routine is a `devframe` RPC
function, one file per function under `src/rpc/functions/`, collected by
`src/rpc/index.ts` into `serverFunctions`. Functions declare bare names; the
`component-highlighter` scope namespaces them on the wire (e.g. `create-story`
→ `component-highlighter:create-story`).

| RPC function | Type | Purpose |
|---------------|------|---------|
| `get-config` | query | Panel bootstrap: `{ storybookUrl, cwd }` |
| `storybook-status` | query | Whether the Storybook dev server is responding; carries `startFailure` if the last start died |
| `storybook-index` | query | Proxy of Storybook's `index.json` |
| `start-storybook` | action | Start Storybook as an interactive PTY session via `ctx.terminals` |
| `check-story` | query | Whether a story file exists for a given component path |
| `create-story` | action | Generate and write a story file; broadcasts `story-created` |
| `get-coverage` | query | Compute and return coverage data |
| `push-registry-diff` | action | Client syncs registry changes to shared state |
| `scroll-to-component` | action | Panel asks the client to scroll to a component instance (by `id`, else first by name) and pulse it |
| `toggle-highlight-visibility` | action | Panel shows/hides the selected component's persistent highlight; hover and select keep working |
| `highlight-coverage-instances` | action | Panel asks the client to show/clear coverage highlights |
| `highlight-coverage-batch` | action | Panel asks the client to batch-highlight coverage instances |
| `set-highlight-mode` | action | Toggle highlight mode on the client |
| `set-prop` | action | Panel live-edits a prop on the client |
| `reset-prop` | action | Panel resets a prop to its original value |
| `select-component` | action | Client/overlay selects a component in the panel |
| `visit-story` | action | Tell the panel to navigate to a story |
| `notify` | action | Show a toast notification via DevTools logs |
| `highlight-target` | action | Debug-log the current highlight target |
| `toggle-overlay` | action | Debug-log an overlay toggle |

`start-storybook` spawns Storybook as an interactive PTY session
(`storybook-dev`) in devframe's Terminals dock, so prompts like a
port-conflict question can be answered. The panel's "Open Terminal" buttons
and the failure toast deep-link to it via `hub:docks:activate`. A dead
session stays registered for its scrollback; the next start respawns it.

Open-in-editor goes through the `@devframes/service-open` wire service,
registered on every host as `devframes:service:open:open-in-editor`. The
panel and overlay feature-detect it and fall back to Vite's
`/__open-in-editor` endpoint when unavailable.

## Key modules (where to edit)

| Module | Responsibility |
|--------|---------------|
| `src/unplugin.ts` | Portable instrumentation core: transform pipeline, coverage tracking, diagnostics, virtual-module resolution |
| `src/create-component-highlighter-plugin.ts` | Vite adapter and devframe mount |
| `src/rsbuild.ts` | Rsbuild/rspack adapter |
| `src/next.ts` | Next.js/webpack adapter and route-handler factories |
| `src/hub-setup.ts` | Host-neutral hub surfaces: docks, commands, terminals, diagnostics |
| `src/react-dedupe.ts` | React-major-mismatch detection driving `resolve.dedupe` |
| `src/vite.ts` | `./vite` entry: resolves the framework config and delegates to the Vite adapter |
| `src/devframe.ts` | The `storybook-devtools` devframe definition |
| `src/storybook-process.ts` | Storybook process lifecycle: session slot, start-failure tracking, terminal/session id constants |
| `src/rpc/functions/` | One file per RPC function |
| `src/rpc/index.ts` | `serverFunctions` barrel and RPC/shared-state type augmentation |
| `src/context.ts` | Maps a devframe context to the deps it was created with |
| `src/devframe-export.ts` | `./devframe` entry for mounting the definition in a custom DevTools host |
| `src/frameworks/<fw>/transform.ts` | Build-time tagging (React metadata call; Vue runtime import) |
| `src/frameworks/react/devtools-hook.ts` | Inline script installing the React DevTools global hook |
| `src/frameworks/vue/devtools-hook.ts` | Inline script installing the Vue DevTools global hook |
| `src/frameworks/nuxt/plugin.ts` | Nuxt entry: SSR head-script helpers and the dev-server bridge module |
| `src/frameworks/<fw>/runtime-module.ts` | Runtime instance registration and prop serialization |
| `src/frameworks/<fw>/story-generator.ts` | Framework-specific story code output |
| `src/runtime-helpers.ts` | Shared runtime tracking: DOM anchoring, serialization coalescer, live prop-edit machinery |
| `src/client/listeners.ts` | Event wiring, highlight mode state, keyboard shortcuts |
| `src/client/overlay.ts` | Highlight rendering, story file cache, save actions |
| `src/client/context-menu.ts` | Context menu UI (Shadow DOM) |
| `src/client/highlight-machine.ts` | Highlight/selection state machine |
| `src/client/highlight-label.ts` | Highlight label rendering |
| `src/client/interaction-recorder.ts` | User interaction recording for play functions |
| `src/client/coverage-actions.ts` | Client-side coverage actions (scroll, highlight) triggered by the panel |
| `src/client/vite-devtools.ts` | DevTools dock lifecycle, client RPC handler registration |
| `src/client/logger.ts` | Debug logging (`window.__componentHighlighterDebug`) |
| `src/client/utils/host-context.ts` | Resolves the app-page client context across embedded/standalone hosts |
| `src/client/utils/format-utils.ts` | Value formatting for the context menu |
| `src/client/utils/html-preview.ts` | HTML preview rendering for prop values |
| `src/client/utils/prop-utils.ts` | Prop classification, editability, badge utilities |
| `src/client/utils/prop-editor.ts` | Shared inline prop editor form builder |
| `src/panel/panel.ts` | DevTools panel tabs |
| `src/utils/story-matching.ts` | Story-to-component matching against Storybook's `index.json`, and visit-target selection |
| `src/utils/instance-selection.ts` | Props fingerprinting and picking one live instance per variant for story creation, preferring an instance with live edits || `src/utils/story-generator.ts` | Shared story generation utilities (naming, args formatting) |
| `src/utils/normalize-runtime-imports.ts` | Normalizes runtime import specifiers across hosts |
| `src/utils/storybook-docs-url.ts` | Resolves the Storybook docs URL for the "Open Docs" command |
| `src/codegen/interactions-to-code.ts` | Converts recorded interactions to play-function code |
| `src/codegen/generate-query.ts` | Generates Testing Library queries from recorded targets |
| `src/codegen/args-to-string.ts` | Serializes args objects to source strings |
| `src/codegen/combine-interactions.ts` | Combines/deduplicates sequential interaction steps |
| `src/codegen/get-interaction-event.ts` | Maps DOM events to interaction event types |
| `src/coverage-dashboard.ts` | Server-side coverage computation |
| `src/notifications.ts` | Notification abstraction (DevTools Logs API + console fallback) |
| `src/shared-types.ts` | Shared server/client types |

## Window globals (automation / testing hooks)

| Global | Purpose |
|--------|---------|
| `__componentHighlighterRegistry` | Live component instance `Map` |
| `__componentHighlighterEnable()` | Enable highlight mode (bypass dock) |
| `__componentHighlighterDisable()` | Disable highlight mode |
| `__componentHighlighterIsActive()` | Check if highlight mode is on |
| `__componentHighlighterDeactivateDock()` | Programmatically toggle the dock off |
| `__componentHighlighterSelectById(id)` | Select a component instance by registry ID |
| `__componentHighlighterGetRegistry()` | Return the live name→filePath registry Map |
| `__componentHighlighterDebug` | Set `true` for verbose debug logging |
| `__componentHighlighterActivateTracking()` | Turn on prop serialization (called automatically when a DevTools client connects) |
| `__componentHighlighterCanEditProps()` | True when live prop editing is available |
| `__componentHighlighterSetProp(id, path, {kind,text})` | Live-edit a prop; returns `{ok, error?}` |
| `__componentHighlighterResetProp(id, path)` | Revert a previously-edited prop; returns `{ok, error?}` |
| `__componentHighlighterGetEditedProps(id)` | Top-level prop keys currently edited, for the reset affordance |

## Panel-client communication (RPC-based)

The panel is a standalone HTML app that can pop out into its own window.
Panel-to-client communication is a server relay: panel calls a server RPC
function, the server broadcasts, a client-registered handler acts on the DOM.

| Server RPC (panel calls) | Client broadcast handler | Purpose |
|--------------------------|-------------------------|---------|
| `push-registry-diff` | — (client pushes to server) | Client syncs registry changes to shared state |
| `scroll-to-component` | `do-scroll-to-component` | Scroll the app page to a component instance and pulse it |
| `toggle-highlight-visibility` | `do-toggle-highlight-visibility` | Show/hide the selected component's persistent highlight |
| `highlight-coverage-instances` | `do-highlight-coverage` | Show/clear coverage highlights |
| `highlight-coverage-batch` | `do-highlight-coverage-batch` | Batch-highlight coverage instances (Preview button) |
| `set-highlight-mode` | `do-set-highlight-mode` | Toggle highlight mode |
| `set-prop` | `do-set-prop` | Panel live-edits a prop via `__componentHighlighterSetProp` |
| `reset-prop` | `do-reset-prop` | Panel resets a prop via `__componentHighlighterResetProp` |
| `select-component` | `do-select-component` | Client/overlay selects a component in the panel |
| `visit-story` | `do-visit-story` | Tell the panel to navigate to a story |
| `notify` | — (server-side only) | Show a toast notification |
| — (create-story handler) | `story-created` | Server broadcasts the story creation result; client relays it to `visit-story` when Storybook is running |
| — (command handler) | `do-open-url` | Open a URL in a new tab (e.g. Storybook docs) |
| — (command handler) | `do-open-panel-tab` | Switch the dock to the Storybook panel entry |
| — (command handler) | `do-switch-tab` | Switch to a specific panel tab |

## Shared state (auto-synced between server and clients)

| Key | Type | Purpose |
|-----|------|---------|
| `registry` | `SerializedRegistryInstance[]` | Component instances synced from client to panel |
| `pending-visit` | `{ relativeFilePath, preferredStoryName } \| null` | Story navigation request, consumed by the panel |
| `pending-tab` | `string \| null` | Tab switch request, consumed by the panel |
| `highlight-active` | `boolean` | Whether highlight mode is on |
| `highlights-visible` | `boolean` | Whether the selected component's persistent highlight is shown; the client owns it, the panel mirrors it for the Show/Hide highlights label |
| `selected-component` | `SerializedRegistryInstance \| null` | Currently selected component |
| `highlighter-tab-active` | `boolean` | Whether the panel's highlighter tab is active; drives whether client clicks open the panel or the context menu |

## DevTools commands (Mod+K palette)

| Command ID | Title | Shortcut | Description |
|------------|-------|----------|-------------|
| `storybook:toggle-highlight-mode` | Toggle Component Highlighter | `Mod+Shift+H` | Start/stop inspecting components |
| `storybook:create-missing-stories` | Write Stories for Missing Components | — | Generate stories for all visible uncovered components |
| `storybook:see-coverage` | See Component Coverage | — | Open the coverage dashboard |
| `storybook:open-docs` | Open Storybook Docs | — | Open the Storybook documentation site |

## Keyboard shortcuts

| Key | Action | Context |
|-----|--------|---------|
| `Mod+K` | Open command palette | Any time DevTools is active |
| `Mod+Shift+H` | Toggle highlight mode | Any time DevTools is active |
| `Alt` (press) | Toggle click-through mode | While highlight mode is on |
| `Escape` | Clear selection | While a component is selected |
| `Escape` x2 | Exit highlight mode | While highlight mode is on |

## Invariants

1. **Cross-framework parity.** User-visible behavior stays aligned across
   supported frameworks unless intentionally documented otherwise.

2. **Stable metadata pathing.** Story save actions depend on correct
   component path/name metadata. Regressions here surface as unknown paths
   or wrong story targets.

3. **CI-safe automation path.** E2E must not require manual Vite DevTools
   authorization. Activation hooks/config must stay deterministic.

4. **Shared e2e reuse first.** Common behavior belongs in shared e2e
   helpers/suites. Framework-specific specs cover true deltas only.

5. **Lazy prop serialization.** Components register cheaply (id/meta/element)
   at all times; prop serialization is gated by `isTrackingActive()` and
   only turns on once a DevTools RPC client connects. Per-render updates are
   coalesced to one serialization per animation frame. Always route
   serialization through `scheduleSerialization`, never call `serializeProps`
   directly on the hot path.

6. **Only `serializedProps` crosses RPC.** Raw live props hold unclonable
   values (functions, DOM nodes, circular structures). Every server/panel
   consumer reads `serializedProps`, never raw props. The serializer reduces
   non-story-safe values to a marker (`__isJSX`, `__isFunction`, `__isDate`,
   `__isObject`) so the wire payload is always structured-clone-safe.

7. **React detection is non-intrusive.** No HOC/boundary wrapper. Detection
   runs off the React DevTools fiber tree; the build-time transform only
   appends the `__chRegisterMeta` tag.

8. **RSC gate is opt-in.** The `rsc` option is off by default — every
   component is treated as a client component. When `rsc: true`, the
   transform tags only modules with a leading `"use client"` directive,
   leaving server-component modules untouched so the client runtime never
   enters the server graph. Owned by
   `src/frameworks/react/transform.ts` (`hasUseClientDirective`), covered by
   the "RSC mode" unit tests.

9. **Hook script loads before module scripts.** The inline DevTools hook
   must be injected into `<head>` before any module script, so it exists
   before react-dom (or Vue) registers its renderer.

10. **React 18 and 19 fiber-field constraints.** Both versions are required
    and both are E2E-gated (`playground/react` + `playground/react18`). The
    runtime must not depend on `_debugSource` (removed in 19) or
    React-internal tag-number constants — only the typeof-guarded reconciler
    hook contract and fiber fields stable since React 16. Source identity
    comes from the `__chRegisterMeta` tag, not React internals.

11. **React dedupe only on a detected mismatch.** `dedupeReact` (default
    `'auto'`) adds `react`/`react-dom` to the bundler's dedupe list only when
    `resolveReactDedupe` detects a React-major mismatch between the app and
    this plugin's own `react-element-to-jsx-string` dependency. Single-
    version React 19 apps get no config mutation. `false` opts out but logs
    a warning on a detected mismatch.

12. **Fiber walk is synchronous on commit.** React batches a render pass
    into one commit, so the walk runs once per render pass, not per
    `setState`. This keeps register/update event ordering deterministic for
    the overlay/panel state machine. Do not move it to
    `requestAnimationFrame` (throttled in background tabs) or a microtask
    (reorders events relative to the commit).

13. **Multi-renderer `overrideProps` capture.** More than one renderer can
    register on the devtools hook — for example Next's App Router registers
    a react-dom instance without `overrideProps` alongside the real client
    renderer, plus the RSC flight renderer. `handleCommit`
    (`runtime-module.ts`) re-checks each commit's renderer until one exposes
    `overrideProps`, rather than latching onto whichever renderer committed
    first.

14. **Shadow DOM context menu.** Rendered inside Shadow DOM to isolate
    styles. Key interactive elements have stable IDs for E2E:
    `#open-component-btn`, `#story-name-input`, `#save-story-btn`,
    `#save-story-with-interactions-btn`.

## Tests that protect this architecture

Baseline commands:

```bash
pnpm test
pnpm exec playwright test
```

Focused e2e entrypoints:

```bash
# Framework-specific detection
pnpm exec playwright test e2e/playground-react-detection.spec.ts     # React 19
pnpm exec playwright test e2e/playground-react18-detection.spec.ts    # React 18 + serialization fidelity
pnpm exec playwright test e2e/playground-vue-detection.spec.ts
pnpm exec playwright test e2e/playground-nuxt-detection.spec.ts       # Nuxt SSR

# Rsbuild host detection (React 19, playground/react/src via symlink) + shared suites
pnpm exec playwright test e2e/playground-rsbuild-detection.spec.ts   # port 5177 — run `pnpm build` first

# Next.js host detection (React 19, App Router, RSC boundary) + shared suites
pnpm exec playwright test e2e/playground-next-detection.spec.ts      # port 5178

# Highlighter interaction tests (context menu, story creation)
pnpm exec playwright test e2e/component-highlighter.spec.ts

# Common highlighter features (runs for both frameworks)
pnpm exec playwright test e2e/common-highlighter-suite.ts

# Listeners-ready registry replay (late-loading listeners recovery, all playgrounds)
pnpm exec playwright test -g "listeners-ready registry replay"
```

The playgrounds import `client/listeners` eagerly for deterministic E2E
activation; real consuming apps don't, so their listeners module loads late
(via the async DevTools client) and misses the initial register events.
`e2e/common-listeners-replay-suite.ts` covers the recovery path: it clears
the client registry, re-dispatches `component-highlighter:listeners-ready`,
and asserts the runtime replays the full registry with working highlighting.

## Known caveats

- **Intermittent E2E flake**: `e2e/common-highlight-panel-state-suite.ts` →
  "panel close then dock activate clears stale selection and shows context
  menu" can intermittently show the context menu when it expects it
  suppressed. It is a race between `PANEL_HIGHLIGHTER_ACTIVATE` propagation
  and `SELECT_COMPONENT` in the highlight state machine.
- **RSC**: server components never run the devtools hook, so they are
  invisible to detection. This is by design.
- **Detection scope**: only exported, statically-named, PascalCase
  components are tagged, since only exported components can have stories.

## Maintenance rule

When you change any of the following, update this file in the same PR:

- module responsibilities
- story creation flow
- server RPC surface
- runtime registration model
- context menu structure or IDs
- panel tabs or features
- keyboard shortcuts
- window globals
- test architecture assumptions
- framework parity expectations
