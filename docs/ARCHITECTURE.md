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
   - React: Babel AST transform wraps components with `withComponentHighlighter` HOC
   - Vue: SFC compiler injects `withComponentHighlighter` composable into `<script setup>`
   - Both inject metadata (componentName, filePath, relativeFilePath, sourceId)

3. **Browser runtime** (`src/frameworks/*/runtime-module.ts` + `src/runtime-helpers.ts`)
   - Registers component instances in a global `Map` registry on `window`
   - Tracks props, serialized props, and DOM anchor elements
   - Emits `component-highlighter:register/unregister/update-props` custom events
   - Framework-specific: React uses hooks/refs, Vue uses lifecycle hooks

4. **Overlay + listeners** (`src/client/overlay.ts`, `src/client/listeners.ts`, `src/client/context-menu.ts`)
   - Renders highlight rectangles in `#component-highlighter-container`
   - Handles hover, click, keyboard shortcuts (Alt, Shift+H, Escape, double-Escape)
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
| `/__open-in-editor` | GET | Open a file in the user's editor |

## Key modules (where to edit)

| Module | Responsibility |
|--------|---------------|
| `src/create-component-highlighter-plugin.ts` | Server entrypoint, RPC wiring, endpoints, virtual module serving |
| `src/frameworks/<fw>/transform.ts` | Build-time instrumentation and metadata injection |
| `src/frameworks/<fw>/runtime-module.ts` | Runtime instance registration and prop serialization |
| `src/runtime-helpers.ts` | Shared runtime tracking helpers (DOM anchoring, observers) |
| `src/client/listeners.ts` | Event wiring, highlight mode state, keyboard shortcuts |
| `src/client/overlay.ts` | Highlight rendering, story file cache, save actions, debug overlay |
| `src/client/context-menu.ts` | Context menu UI (Shadow DOM), props display, action buttons |
| `src/client/interaction-recorder.ts` | User interaction recording and play function generation |
| `src/client/coverage-actions.ts` | Client-side coverage actions (scroll, highlight) triggered by panel via RPC |
| `src/client/vite-devtools.ts` | DevTools dock lifecycle, client RPC handlers for panel→client broadcast |
| `src/panel/panel.ts` | DevTools panel tabs (Storybook, Coverage, Terminal, Docs) |
| `src/frameworks/<fw>/story-generator.ts` | Framework-specific story code output |
| `src/utils/story-generator.ts` | Shared story generation utilities (name generation, args formatting) |

## Window globals (automation / testing hooks)

| Global | Purpose |
|--------|---------|
| `__componentHighlighterRegistry` | Live component instance `Map` |
| `__componentHighlighterEnable()` | Enable highlight mode (bypass dock) |
| `__componentHighlighterDisable()` | Disable highlight mode |
| `__componentHighlighterIsActive()` | Check if highlight mode is on |
| `__componentHighlighterToggle()` | Toggle highlight-all mode |
| `__componentHighlighterDraw()` | Force redraw all highlights |
| `__componentHighlighterDeactivateDock()` | Programmatically toggle dock off |

## Panel↔Client communication (RPC-based)

The panel runs as a standalone HTML app that can be popped out into a separate window.
All panel→client communication uses Vite DevTools RPC with server-side relay:

```
Panel → server RPC call → server broadcasts → client RPC handler → DOM operation
```

| Server RPC (panel calls) | Client broadcast handler | Purpose |
|--------------------------|-------------------------|---------|
| `component-highlighter:get-registry` | — (query, no broadcast) | Panel reads serialized registry snapshot |
| `component-highlighter:push-registry-diff` | — (client pushes to server) | Client syncs registry changes to server |
| `component-highlighter:scroll-to-component` | `do-scroll-to-component` | Scroll app page to a component |
| `component-highlighter:highlight-coverage-instances` | `do-highlight-coverage` | Show/clear coverage highlights on app page |
| `component-highlighter:set-highlight-mode` | `do-set-highlight-mode` | Toggle highlight mode on/off |
| `component-highlighter:visit-story` | `do-visit-story` | Tell panel to navigate to a story |

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

5. **Shadow DOM context menu**
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
pnpm exec playwright test e2e/playground-react-detection.spec.ts
pnpm exec playwright test e2e/playground-vue-detection.spec.ts

# Common highlighter features (runs for both frameworks)
pnpm exec playwright test e2e/common-highlighter-suite.ts
```

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
