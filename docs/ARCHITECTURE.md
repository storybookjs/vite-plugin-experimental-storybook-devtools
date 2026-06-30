# Architecture (Agent-Focused)

Short, high-signal reference for contributors and coding agents.

> Keep this file concise. If behavior/flow changes, update this file in the same PR.

## What this plugin does

`vite-plugin-experimental-storybook-devtools` tracks rendered components in dev, overlays highlights in the browser, and generates Storybook stories from runtime props. It supports both React and Vue.

## Supported frameworks

See `docs/SUPPORTED_FRAMEWORKS.md` for the current framework list.

## Runtime flow (end-to-end)

1. **Vite plugin setup** (`src/create-component-highlighter-plugin.ts`)
   - Registers transform hooks for the active framework
   - Registers DevTools dock integration (panel, RPC, client script)
   - Exposes server middleware endpoints (`/__component-highlighter/*`)
   - Handles story file creation via RPC

2. **Framework transform** (`src/frameworks/*/transform.ts`)
   - React: **non-intrusive** Babel AST transform — components are NOT wrapped.
     It only appends an idempotent metadata tag `__chRegisterMeta(Component,
     { componentName, filePath, relativeFilePath, sourceId, isDefaultExport })`.
     The rendered fiber/DOM tree is untouched, so RSC works (only tagged client
     components ever appear) and there is no tree pollution.
   - Vue: SFC compiler injects `withComponentHighlighter` composable into
     `<script setup>` (Vue lacks a DevTools-hook equivalent we rely on).
   - Both inject metadata (componentName, filePath, relativeFilePath, sourceId)

3. **Browser runtime** (`src/frameworks/*/runtime-module.ts` + `src/runtime-helpers.ts`)
   - React: an inline `<head>` script (`src/frameworks/react/devtools-hook.ts`,
     injected via `transformIndexHtml`) installs a minimal
     `__REACT_DEVTOOLS_GLOBAL_HOOK__` *before* react-dom registers. The runtime
     module subscribes via `window.__chInstallCommitHandler` and walks the live
     fiber tree on every commit, reading the `__chRegisterMeta` symbol off
     `fiber.type`/`elementType`, resolving the nearest host DOM node, and
     reconciling the registry. No component is wrapped.
   - Vue: lifecycle-hook based registration via the injected composable.
   - Registers component instances in a global `Map` registry on `window`
   - Tracks props, serialized props, and DOM anchor elements
   - Emits `component-highlighter:register/unregister/update-props` custom events

4. **Overlay + listeners** (`src/client/overlay.ts`, `src/client/listeners.ts`, `src/client/context-menu.ts`)
   - Renders highlight rectangles in `#component-highlighter-container`
   - Handles hover, click, keyboard shortcuts (Alt toggle, Escape, double-Escape)
   - Context menu (Shadow DOM) shows props, action buttons, story creation form
   - Triggers story creation requests (Create / Create with Interactions)
   - Interaction recorder (`src/client/interaction-recorder.ts`) captures user actions as play function steps

5. **DevTools panel** (`src/panel/panel.ts`)
   - Four tabs: Storybook (embedded iframe), Coverage (dashboard), Terminal (process output), Docs
   - Coverage tab: lists all detected components, shows story status, bulk "Create all" button
   - Panel communicates via Vite DevTools RPC (works whether inline or popped out)
   - Story navigation uses Storybook channel API (`__STORYBOOK_ADDONS_CHANNEL__.emit('setCurrentStory')`) for smooth transitions

6. **Story generation (server)** (`src/frameworks/*/story-generator.ts`)
   - Receives payload from client via DevTools RPC
   - Generates framework-specific story source (React `.stories.tsx`, Vue `.stories.ts`)
   - Writes new files or appends to existing story files
   - Sends HMR event back to client for feedback

## Server middleware endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/__component-highlighter/check-story` | GET | Check if a story file exists for a component |
| `/__component-highlighter/coverage` | GET | Return coverage data for all detected components |
| `/__component-highlighter/storybook-status` | GET | Check if Storybook dev server is running |
| `/__component-highlighter/storybook-index` | GET | Proxy Storybook's index.json for story entries |
| `/__component-highlighter/start-storybook` | POST | Start a Storybook dev server process |
| `/__component-highlighter/terminal-logs` | GET | Stream accumulated Storybook process output |
| `/__open-in-editor` | GET | Open a file in the user's editor (Vite built-in, not registered by this plugin) |

## Key modules (where to edit)

| Module | Responsibility |
|--------|---------------|
| `src/create-component-highlighter-plugin.ts` | Server entrypoint, RPC wiring, endpoints, virtual module serving. Registers docks via `defineDockEntry`; registers a `ctx.diagnostics` catalog (`CH_TRANSFORM_FAILED`, `CH_UNSUPPORTED_PATTERN`) emitted from the transform hook |
| `src/frameworks/<fw>/transform.ts` | Build-time metadata tagging (React: non-wrapping `__chRegisterMeta`). Reports non-fatal detection gaps (parse failures, unsupported patterns) via `TransformOptions.onIssue` → DevTools diagnostics |
| `src/frameworks/react/devtools-hook.ts` | Inline `<head>` script: installs the minimal React DevTools global hook + `__chInstallCommitHandler` bridge |
| `src/frameworks/<fw>/runtime-module.ts` | Runtime instance registration and prop serialization (React: fiber-tree walker driven by the DevTools hook) |
| `src/runtime-helpers.ts` | Shared runtime tracking helpers (DOM anchoring, observers, tracking gate + per-frame serialization coalescer) |
| `src/client/listeners.ts` | Event wiring, highlight mode state, keyboard shortcuts |
| `src/client/overlay.ts` | Highlight rendering, story file cache, save actions, debug overlay |
| `src/client/context-menu.ts` | Context menu UI (Shadow DOM), props display, action buttons |
| `src/client/interaction-recorder.ts` | User interaction recording and play function generation |
| `src/client/coverage-actions.ts` | Client-side coverage actions (scroll, highlight) triggered by panel via RPC |
| `src/client/vite-devtools.ts` | DevTools dock lifecycle, client RPC handlers for panel→client broadcast |
| `src/client/logger.ts` | Debug logging utility (`window.__componentHighlighterDebug`) |
| `src/client/utils/format-utils.ts` | Value formatting helpers for context menu display |
| `src/client/utils/html-preview.ts` | HTML preview rendering for prop values |
| `src/client/utils/prop-utils.ts` | Prop classification, editability, and badge utilities (pure; shared by context menu + panel) |
| `src/client/utils/prop-editor.ts` | Shared inline prop editor (`createPropEditor`): one form builder for both the context menu (in-page `overrideProps`) and the panel (RPC `set-prop`) |
| `src/panel/panel.ts` | DevTools panel tabs (Storybook, Coverage, Terminal, Docs) |
| `src/frameworks/<fw>/story-generator.ts` | Framework-specific story code output |
| `src/utils/story-generator.ts` | Shared story generation utilities (name generation, args formatting) |
| `src/codegen/interactions-to-code.ts` | Converts recorded interactions to play function code |
| `src/codegen/generate-query.ts` | Generates Testing Library queries from recorded targets |
| `src/codegen/args-to-string.ts` | Serializes args objects to source code strings |
| `src/codegen/combine-interactions.ts` | Combines/deduplicates sequential interaction steps |
| `src/codegen/get-interaction-event.ts` | Maps DOM events to interaction event types |
| `src/coverage-dashboard.ts` | Server-side coverage computation (component → story file matching) |
| `src/notifications.ts` | Notification abstraction (DevTools Logs API + console fallback) |
| `src/shared-types.ts` | Shared types for server/client (SerializedRegistryInstance, RegistryDiff) |

## Window globals (automation / testing hooks)

| Global | Purpose |
|--------|---------|
| `__componentHighlighterRegistry` | Live component instance `Map` |
| `__componentHighlighterEnable()` | Enable highlight mode (bypass dock) |
| `__componentHighlighterDisable()` | Disable highlight mode |
| `__componentHighlighterIsActive()` | Check if highlight mode is on |
| `__componentHighlighterDeactivateDock()` | Programmatically toggle dock off |
| `__componentHighlighterSelectById(id)` | Select a specific component instance by its registry ID |
| `__componentHighlighterGetRegistry()` | Return the live component name→filePath registry Map |
| `__componentHighlighterDebug` | Set to `true` to enable verbose debug logging in the console |
| `__componentHighlighterActivateTracking()` | Turn on prop serialization + backfill (called automatically when a DevTools client connects) |
| `__componentHighlighterCanEditProps()` | React only: true when the renderer exposes `overrideProps` (dev builds) |
| `__componentHighlighterSetProp(id, path, {kind,text})` | React only: live-edit a prop via React's `renderer.overrideProps`; returns `{ok, error?}`. Snapshots the pre-edit value (once) so the edit is resettable |
| `__componentHighlighterResetProp(id, path)` | React only: revert a previously-edited prop to its original (pre-edit) value; returns `{ok, error?}` |
| `__componentHighlighterGetEditedProps(id)` | React only: top-level prop keys whose current value differs from their original (drives the per-prop reset affordance) |

## Panel↔Client communication (RPC-based)

The panel runs as a standalone HTML app that can be popped out into a separate window.
All panel→client communication uses Vite DevTools RPC with server-side relay:

```
Panel → server RPC call → server broadcasts → client RPC handler → DOM operation
```

| Server RPC (panel calls) | Client broadcast handler | Purpose |
|--------------------------|-------------------------|---------|
| `component-highlighter:push-registry-diff` | — (client pushes to server) | Client syncs registry changes to shared state |
| `component-highlighter:scroll-to-component` | `do-scroll-to-component` | Scroll app page to a component |
| `component-highlighter:highlight-coverage-instances` | `do-highlight-coverage` | Show/clear coverage highlights on app page |
| `component-highlighter:set-highlight-mode` | `do-set-highlight-mode` | Toggle highlight mode on/off |
| `component-highlighter:set-prop` | `do-set-prop` | Panel live-edits a prop → client calls `__componentHighlighterSetProp` (React `overrideProps`) |
| `component-highlighter:reset-prop` | `do-reset-prop` | Panel resets a prop to its original → client calls `__componentHighlighterResetProp` |
| `component-highlighter:visit-story` | `do-visit-story` | Tell panel to navigate to a story |
| `component-highlighter:notify` | — (server-side only) | Show a toast notification via DevTools logs |
| — (command handler) | `do-open-url` | Open a URL in a new browser tab (e.g. Storybook docs) |
| — (command handler) | `do-open-panel-tab` | Switch the dock to the Storybook panel entry |
| — (command handler) | `do-switch-tab` | Switch to a specific tab within the panel (registered in panel.ts) |

## Shared state (auto-synced between server and clients)

| Key | Type | Purpose |
|-----|------|---------|
| `component-highlighter:registry` | `SerializedRegistryInstance[]` | Component instances synced from client to panel |
| `component-highlighter:pending-visit` | `{ relativeFilePath, preferredStoryName } \| null` | Story navigation request (consumed by panel) |
| `component-highlighter:pending-tab` | `string \| null` | Tab switch request (consumed by panel) |
| `component-highlighter:highlight-active` | `boolean` | Whether highlight mode is on (syncs panel toggle button) |

## DevTools commands (Mod+K palette)

| Command ID | Title | Shortcut | Description |
|------------|-------|----------|-------------|
| `storybook:toggle-highlight-mode` | Toggle Component Highlighter | `Mod+Shift+H` | Start/stop inspecting components |
| `storybook:create-missing-stories` | Write Stories for Missing Components | — | Generate stories for all visible uncovered components |
| `storybook:see-coverage` | See Component Coverage | — | Open the coverage dashboard showing story status |
| `storybook:open-docs` | Open Storybook Docs | — | Open the Storybook documentation website |

## Keyboard shortcuts

| Key | Action | Context |
|-----|--------|---------|
| `Mod+K` | Open command palette | Any time DevTools is active |
| `Mod+Shift+H` | Toggle highlight mode | Any time DevTools is active |
| `Alt` (press) | Toggle click-through mode | While highlight mode is on |
| `Escape` | Clear selection | While a component is selected |
| `Escape` x2 | Exit highlight mode | While highlight mode is on |

## Invariants (do not break)

1. **Cross-framework parity**
   - User-visible behavior should stay aligned across supported frameworks unless intentionally documented.

2. **Stable metadata pathing**
   - Story save actions depend on correct component path/name metadata.
   - Regressions often surface as unknown paths or wrong story targets.

3. **CI-safe automation path**
   - E2E should not require manual Vite DevTools authorization.
   - Keep deterministic activation hooks/config for tests.

4. **Shared e2e reuse first**
   - Common behavior belongs in shared e2e helpers/suites.
   - Framework-specific specs should only contain true deltas.

5. **Lazy prop serialization (zero overhead until DevTools connects)**
   - Components register cheaply (id/meta/element) at all times, but prop
     serialization is gated by `isTrackingActive()` and only turns on when a
     DevTools RPC client connects (`setRegistryRpcCall` → `activateTracking()`).
   - Per-render prop updates are coalesced to one serialization per animation
     frame; instances removed before the frame flushes are skipped.
   - Do not call `serializeProps` directly on the hot path — route it through
     `scheduleSerialization` so this guarantee is preserved across frameworks.
   - **Only `serializedProps` crosses RPC.** Raw live props hold unclonable
     values (functions, DOM nodes via `ref`, circular structures) and are never
     put on `SerializedRegistryInstance` / `create-story` / `select-component`
     payloads. Every server + panel consumer (story generation, panel display,
     fingerprinting, story-name suggestion) reads `serializedProps`. The
     serializer reduces every non-story-safe value to a marker
     (`__isJSX` / `__isFunction` / `__isDate` / `__isObject` for non-plain
     objects like Map/Set/class instances) so the wire payload is always
     structured-clone-safe and round-trippable.

6. **React detection is non-intrusive**
   - Never reintroduce an HOC/boundary wrapper for React. Components must not
     be wrapped: detection runs off the React DevTools fiber tree so the
     rendered tree stays clean and RSC keeps working. The build-time transform
     may only append the `__chRegisterMeta` tag.
   - **RSC (`rsc` option):** off by default (SPA — every component is a client
     component, so all matching modules are tagged). When `rsc: true`
     (Vite-based RSC frameworks like TanStack Start), the transform only tags
     modules with a leading `"use client"` directive; server-component modules
     are returned untouched so the client runtime is never injected into the
     server graph. Do not make the gate unconditional — it must stay opt-in, or
     it breaks plain SPAs. Gate is owned by `src/frameworks/react/transform.ts`
     (`hasUseClientDirective`) and threaded via the `TransformOptions` arg.
     Covered by the transform "RSC mode" unit tests (no dedicated playground).
   - The inline DevTools hook script must be injected into `<head>` *before*
     any module script (it must exist before react-dom registers its renderer).
   - Must support **React 18 and 19** (both required, both E2E-gated via
     `playground/react` + `playground/react18`). Do not depend on
     `_debugSource` (removed in 19) or React-internal tag-number constants.
     Use only the typeof-guarded reconciler hook contract and the fiber fields
     stable since React 16. Source identity comes from the `__chRegisterMeta`
     tag, not React.
   - The bundled `react-element-to-jsx-string` is resolved from this plugin's
     node_modules; if its React major differs from the app's, its internal
     `React.isValidElement` rejects the app's elements and prop serialization
     silently degrades. The `dedupeReact` option (default `'auto'`) handles
     this: `'auto'` detects a React-major mismatch and adds `react`/
     `react-dom` to `resolve.dedupe` **only then** — React 19 single-version
     apps get no config mutation; React 18 apps get the fix automatically.
     `false` opts out (advanced multi-React setups) but logs a warning on a
     detected mismatch so it never fails silently. Do not make the dedupe
     unconditional again — it must stay opt-in-when-needed.
   - The inline hook script carries the app's CSP nonce when `html.cspNonce`
     is configured (so it survives a strict Content-Security-Policy), and
     rides along with (never clobbers) a real React DevTools extension hook —
     it only defines the global when absent, and exposes a minimal pub/sub +
     `renderers`/`rendererInterfaces` so a late-attaching backend still works.
   - The fiber walk is intentionally **synchronous on commit**. React batches
     a render pass into one commit, so it is one traversal per render pass
     (not per `setState`), and synchronicity preserves deterministic
     register/update event ordering the overlay + panel state machine rely
     on. Do not move it to `requestAnimationFrame` (throttled in background
     tabs → registry stalls) or a microtask/coalescer (reorders events vs the
     commit → overlay/panel races). The expensive work (serialization) stays
     gated by `isTrackingActive()`; per-instance rect observers match the
     prior HOC approach (parity, not new overhead).

7. **Shadow DOM context menu**
   - The context menu is rendered inside Shadow DOM to isolate styles.
   - Key interactive elements have stable IDs for E2E: `#open-component-btn`, `#story-name-input`, `#save-story-btn`, `#save-story-with-interactions-btn`.

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

# Highlighter interaction tests (context menu, story creation)
pnpm exec playwright test e2e/component-highlighter.spec.ts

# Common highlighter features (runs for both frameworks)
pnpm exec playwright test e2e/common-highlighter-suite.ts
```

## Known caveats

- **Pre-existing intermittent E2E flake** (not caused by the fiber refactor):
  `common-highlight-panel-state-suite.ts` → "panel close then dock activate
  clears stale selection and shows context menu" intermittently shows the
  context menu when it expects it suppressed. It is **version-independent**
  (reproduces on React 18 and 19), reproduces with the runtime reverted to
  its pre-refactor-perf baseline, and is a race between
  `PANEL_HIGHLIGHTER_ACTIVATE` propagation and `SELECT_COMPONENT` in the
  xstate machine — not a detection/registry issue. Rate: low in the full
  matrix (`pnpm exec playwright test`), higher when a single Playwright
  project's parallel workers saturate one cold dev server. Proper fix is to
  make the panel-active gate deterministic in `listeners.ts`/the highlight
  machine (or web-first-assert the helper), tracked separately so the
  detection contract stays unmodified.
- **RSC**: client components only — server components never run the hook, so
  they are invisible (by design; the win is it no longer forces client
  boundaries / crashes).
- **Detection scope**: only exported, statically-named, PascalCase components
  are tagged — intentional, since only exported components can have stories.

## Agent maintenance rule

When you change any of the following, update this file in the same PR:

- module responsibilities
- story creation flow
- server middleware endpoints
- runtime registration model
- context menu structure or IDs
- panel tabs or features
- keyboard shortcuts
- window globals
- test architecture assumptions
- framework parity expectations
