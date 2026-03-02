# Architecture (Agent-Focused)

Short, high-signal reference for contributors and coding agents.

> Keep this file concise. If behavior/flow changes, update this file in the same PR.

## What this plugin does

`vite-plugin-experimental-storybook-devtools` tracks rendered components in dev, overlays highlights in the browser, and generates Storybook stories from runtime props.

## Supported frameworks

See `docs/SUPPORTED_FRAMEWORKS.md` for the current framework list.

## Runtime flow (end-to-end)

1. **Vite plugin setup** (`src/create-component-highlighter-plugin.ts`)
   - Registers transform hooks
   - Registers DevTools dock integration
   - Exposes server endpoints / RPC for story operations

2. **Framework transform** (`src/frameworks/*/transform.ts`)
   - Injects runtime bridge for component tracking
   - Provides metadata needed later for story generation (name/path/source ids)

3. **Browser runtime** (`src/frameworks/*/runtime-module.ts` + `src/runtime-helpers.ts`)
   - Registers component instances in a global registry
   - Tracks props/serialized props + DOM anchor elements
   - Emits register/update/unregister events

4. **Overlay + listeners** (`src/client/listeners.ts`, `src/client/overlay.ts`)
   - Renders highlights
   - Handles hover/click/context-menu interactions
   - Triggers story creation requests (save / save-with-interactions)

5. **Story generation (server)** (`src/frameworks/*/story-generator.ts`)
   - Receives payload from client
   - Generates framework-specific story source
   - Writes or updates story files

## Key modules (where to edit)

- `src/create-component-highlighter-plugin.ts`
  - Server entrypoint, RPC wiring, endpoints, virtual module serving.

- `src/frameworks/<framework>/transform.ts`
  - Build-time instrumentation and metadata injection.

- `src/frameworks/<framework>/runtime-module.ts`
  - Runtime instance registration and prop serialization logic.

- `src/runtime-helpers.ts`
  - Shared runtime tracking helpers used across frameworks.

- `src/client/listeners.ts`
  - Event wiring + highlighter activation state.

- `src/client/overlay.ts`
  - Highlight UI, context menu, save actions, interaction-mode UX.

- `src/frameworks/<framework>/story-generator.ts`
  - Framework-specific story code output.

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

## Tests that protect this architecture

Baseline commands:

```bash
pnpm test
pnpm exec playwright test
```

Focused e2e entrypoints currently used for highlighter/story workflows:

```bash
pnpm exec playwright test e2e/playground-react-detection.spec.ts e2e/playground-vue-detection.spec.ts
```

## Agent maintenance rule

When you change any of the following, update this file in the same PR:

- module responsibilities
- story creation flow
- runtime registration model
- test architecture assumptions
- framework parity expectations
