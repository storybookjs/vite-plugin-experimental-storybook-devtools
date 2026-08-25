# AGENTS.md

Guidance for AI coding agents working in this repository.

Read `docs/ARCHITECTURE.md` early for implementation/refactor tasks.

## Goals

- Ship minimal, correct changes.
- Preserve cross-framework parity across all supported integrations.
- Prove behavior with tests before claiming completion.

## Working Rules

1. **Start with tests, not assumptions**
   - If behavior changes, add/update tests first.
   - Prefer extending shared e2e helpers/suites over duplicating spec logic.

2. **Keep framework playgrounds aligned**
   - Component naming and app structure should stay equivalent across supported frameworks when possible.
   - If one framework playground changes, review whether the others should match.
   - `playground/react` (React 19) and `playground/react18` (React 18) share
     ONE source tree: `playground/react18/src` is a symlink to
     `playground/react/src` (canonical). `playground/rsbuild` (Rsbuild host,
     React 19) is a third symlink consumer of the same tree — same mechanics,
     but its shared entry's `client/listeners` + `client/overlay` imports are
     aliased to shims (`playground/rsbuild/shims/`) instead of importing the
     package directly, since Rsbuild has no `/@id/{specifier}` resolution for
     the client bundle. Edit components once in `playground/react/src`; all
     three playgrounds and their shared E2E suites pick it up. React 18 and
     19 are both required and both E2E-gated. Do not replace the symlinks
     with copies.
   - The `rsc` option's `"use client"` transform gate is covered by unit tests
     (`src/frameworks/react/transform.test.ts` → "RSC mode"). Runtime RSC
     coverage lives separately in `playground/next` (App Router, React 19,
     `rsc: true`, mixed server + client components): it has its own source
     tree rather than joining the symlink group above, since the RSC gate
     needs a real server component in the render tree, which the `rsc: false`
     SPA playgrounds don't have. It uses the same client-bundle shim pattern
     as `playground/rsbuild` (`playground/next/shims/`), since Next has no
     `/@id/{specifier}` resolution either.
     `e2e/playground-next-detection.spec.ts` asserts the client component set
     registers and that the server component never appears in the registry.
   - Keep `docs/SUPPORTED_FRAMEWORKS.md` current.

3. **Use shared test primitives**
   - Reuse:
     - `e2e/highlighter-helpers.ts`
     - `e2e/common-highlighter-suite.ts`
     - `e2e/common-listeners-replay-suite.ts` (late-loading listeners recovery)
   - Keep framework-specific specs focused on true framework differences only.

4. **Verify both save flows**
   - `Create` (story with current props)
   - `Create with Interactions` (story with recorded play function)
   - Ensure interaction recording is exercised with real form input/select actions.

5. **Make CI reliable**
   - Avoid relying on manual DevTools authorization in CI (Vite's trust
     prompt, or devframe's OTP gate on Rsbuild/Next — disable it with
     `clientAuth: false` on Rsbuild or `auth: false` on Next).
   - Keep E2E activation deterministic (automation hooks + config).

6. **Keep documentation up to date**
   - If you change architecture, features, testing strategy, workflow, or framework behavior, update the relevant documentation **in the same change**. Do not defer doc updates.
   - Required docs to review and update when applicable:
     - `README.md` - User-facing feature descriptions, configuration, usage guides
     - `AGENTS.md` - Agent working rules and validation steps
     - `docs/ARCHITECTURE.md` - Module responsibilities, endpoints, window globals, key IDs
     - `docs/AGENT_PLAYBOOK.md` - Operational workflow and definition of done
     - `docs/SUPPORTED_FRAMEWORKS.md` - If framework list changed
     - `.github/pull_request_template.md` - If PR process changed
   - When in doubt, update the docs. Stale documentation causes compounding errors for future agents and contributors.

## Verifying DevTools Panel Behavior

When changes affect the panel, coverage dashboard, or panel↔client communication,
verify interactively using preview tools against a playground dev server.

### Setup

Use `.claude/launch.json` to start a playground (E2E env var is removed so DevTools
authorization works). The DevTools dock lives inside
`<devframes-dock-embedded>` — a custom element with a **shadow DOM**.

### Navigating the DevTools UI via preview tools

```js
// Access the shadow root
const dock = document.querySelector('devframes-dock-embedded');
const shadow = dock?.shadowRoot;

// Find dock buttons (Storybook, Component Highlighter, etc.)
const buttons = shadow?.querySelectorAll('button');
// Click by title: btn.title === 'Storybook' or 'Component Highlighter'

// Access the panel iframe (Storybook/Coverage/Terminal/Docs tabs)
const iframe = shadow?.querySelector('iframe');
const iframeDoc = iframe?.contentDocument;

// Interact with panel tab buttons
iframeDoc?.querySelectorAll('.tab-btn');  // click by textContent

// Panel-specific elements
iframeDoc?.getElementById('highlight-toggle');  // highlight mode toggle
iframeDoc?.querySelectorAll('tr.row');           // coverage table rows
iframeDoc?.querySelector('.act-btn.locate');      // scroll-to-component buttons
```

### Authorization

If the DevTools shows "Unauthorized", auto-authorize with:
```js
// The embedded dock host publishes the app-page client context on
// window.__DEVFRAME_HUB_CLIENT_CONTEXT__ (the standalone viewer uses
// __VITE_DEVTOOLS_CLIENT_CONTEXT__ instead — src/client/utils/host-context.ts
// checks both). The auth token is devframe-core state:
// __DEVFRAME_CONNECTION_AUTH_TOKEN__ (read from localStorage or window);
// requestTrustWithToken lives on ctx.rpc.
const ctx =
  window.__VITE_DEVTOOLS_CLIENT_CONTEXT__ ||
  window.__DEVFRAME_HUB_CLIENT_CONTEXT__;
const token =
  localStorage.getItem('__DEVFRAME_CONNECTION_AUTH_TOKEN__') ||
  window.__DEVFRAME_CONNECTION_AUTH_TOKEN__;
ctx.rpc.requestTrustWithToken(token);
```

### What to verify

- Coverage tab: components show correct visible/not-visible status
- Hover on coverage rows: highlight overlays appear on app page (`[data-coverage-highlight]`)
- Highlight toggle: `window.__componentHighlighterIsActive()` reflects state, cursor changes
- Scroll-to-component: locate button triggers scroll via RPC
- Create story / Create all: stories created without errors
- Live prop editing (React AND Vue): the pencil on a prop row edits the live app; reset restores the original
- Registry sync: `(await ctx.rpc.sharedState.get('component-highlighter:registry')).value()` returns the synced instances

### Communication architecture

All panel↔client communication uses Vite DevTools RPC (no `window.parent`).
Client broadcast handlers are registered in `listeners.ts` via `autoInitRpc()` —
they work before dock activation. See `docs/ARCHITECTURE.md` for the full RPC table.

## Required Validation Before Handoff

Run relevant checks (at minimum):

```bash
pnpm test
pnpm exec playwright test
```

If you touch broader behavior, run the full test set impacted by your changes.

## PR Hygiene

- Prefer tests and implementation in the same PR (tests-first sequence within one PR).
- In PR description include:
  - What changed
  - Why
  - Exact commands run
  - Any caveats/follow-ups
- Keep test additions and implementation changes together in one PR whenever practical.

---

## UI Styling — Storybook Design System

The DevTools panel UI uses vanilla JS + Shadow DOM. Do **not** introduce React or Emotion just for styling. Instead, use Storybook's design tokens as CSS custom properties injected at the Shadow DOM root.

### Full token reference
See `/Users/m/projects/storybook/DESIGN_SYSTEM_REPORT.md` (local checkout of storybookjs/storybook).

### In-repo skill
See `.agents/skills/storybook-ui/SKILL.md` for implementation guidance.

### Token injection pattern

```js
const style = document.createElement('style');
style.textContent = getSbTokenStyles(); // see skill for full block
shadowRoot.prepend(style);
```

### Key rules
- Use `--sb-*` CSS custom properties for all colors, typography, and spacing
- Always include both light (`:host {}`) and dark (`@media (prefers-color-scheme: dark)`) blocks
- Never hardcode hex colors — use the `--sb-*` variables
- The Shadow DOM root is `<devframes-dock-embedded>`'s `shadowRoot`
- **Unavailable actions**: omit them from the DOM entirely — do not render them as `disabled`. This applies to popover menus, context menu action buttons, and any other affordance that depends on optional state (e.g. story existence, editor availability).
