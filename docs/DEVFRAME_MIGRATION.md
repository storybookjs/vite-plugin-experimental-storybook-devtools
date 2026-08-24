# Devframe Migration — Feasibility Report & Phased Plan

Status: **planned** (no code migrated yet). This document records the
investigation into migrating this plugin onto [devframe](https://devfra.me/)
(the extracted core of Vite DevTools) and extending it to non-Vite hosts, plus
the agreed phased plan.

## TL;DR

The plugin splits cleanly into two layers with very different migration costs:

| Layer | Coupled to | Migration verdict |
| --- | --- | --- |
| Devtools plumbing (RPC, dock, panel, shared state, terminals, diagnostics, commands) | `@vitejs/devtools-kit` 0.3.3 `devtools.setup(ctx)` | **Near 1:1 mapping** onto `defineDevframe()` — highly migratable |
| Code instrumentation (Babel/SFC transforms, virtual modules, HTML injection, HMR events) | Vite's transform pipeline | **Not abstracted by devframe** — needs an unplugin port for non-Vite hosts |

The in-browser runtime (component registry, overlay, context menu, prop
editor, interaction recorder) is already bundler-agnostic: it hooks the
framework devtools globals (`__REACT_DEVTOOLS_GLOBAL_HOOK__`,
`__VUE_DEVTOOLS_GLOBAL_HOOK__`), not the bundler.

## What devframe is

- The framework-neutral devtools foundation extracted from Vite DevTools, by
  Anthony Fu, MIT — "unplugin for devtools". Vite DevTools is its first
  flagship host; `@vitejs/devtools-kit` 0.6.0 depends on `devframe@^0.9.5`.
- One `defineDevframe({ id, name, version, packageName, homepage, description,
  icon, clientAssets, setup(ctx) })` definition mounts as: a Web-standard
  `Request → Response` handler, connect middleware, a CLI, a standalone dev
  server, a static report, an MCP server, or a Vite DevTools dock (via
  `createPluginFromDevframe` from `@vitejs/devtools-kit/node`).
- RPC: type-safe bidirectional birpc, function types
  `query`/`static`/`action`/`event`, optional Standard Schema validation.
- Shared state: observable, patch-synced server↔browser, survives reconnects.
- Transport: **its own WebSocket at `<base>__ws` + SSE fallback** — not the
  Vite HMR channel. Discovery via `__connection.json`.
- Hub (`@devframes/hub`): headless composition layer providing docks,
  commands, terminals, and messages behind one handler; `@devframes/hub-ui`
  is the reference floating-dock UI. Hub mounts in any host with adapters or
  examples for Vite, Nuxt, Next.js, Rsbuild, Hono, Nitro, Fastify, SvelteKit,
  Deno, Bun.
- Security: localhost + trust handshake (`requestTrustWithToken`,
  `__DEVFRAME_CONNECTION_AUTH_TOKEN__` — the rename we already track in
  `AGENTS.md`).
- Maturity caveat: **pre-1.0 with breaking changes each minor** (published
  migration guides for 0.6 → 0.9 at <https://devfra.me/migrations>).

Key references: <https://devfra.me/guide> · <https://devfra.me/adapters> ·
<https://devfra.me/guide/hub> · <https://devfra.me/guide/transports> ·
<https://devtools.vite.dev/kit/> · <https://github.com/devframes/devframe>

## Current coupling inventory

### Devtools-kit surface (migrates to devframe)

All in `src/create-component-highlighter-plugin.ts` unless noted:

| Today (`@vitejs/devtools-kit` 0.3.3) | Devframe 0.9 equivalent |
| --- | --- |
| `devtools.setup(ctx)` Vite-plugin hook | `defineDevframe({ setup(ctx) })` + `createPluginFromDevframe` |
| `defineRpcFunction`, `ctx.rpc.register/broadcast/invokeLocal` | `defineRpcFunction` (birpc; `query`/`action`/`event` types) |
| `ctx.rpc.sharedState` (`registry`, `pending-visit`, `pending-tab`, `highlight-active`, `selected-component`, `highlighter-tab-active`) | devframe shared state (patch-synced) |
| `ctx.docks.register` (action dock + iframe dock) | derived from definition metadata by `createPluginFromDevframe`; hub docks elsewhere |
| `ctx.views.hostStatic('/.storybook-devtools/', distPanel)` | `clientAssets` / `view: { type: 'spa', distDir }` |
| `ctx.terminals.startChildProcess` (Storybook process) | hub terminals (available wherever hub is mounted) |
| `ctx.messages` (notifications, `src/notifications.ts`) | hub messages / `@devframes/plugin-messages` |
| `ctx.diagnostics` (`CH_TRANSFORM_FAILED`, `CH_UNSUPPORTED_PATTERN`) | `nostics` structured diagnostics |
| `ctx.commands.register` (Mod+K palette) | hub commands |
| `@vitejs/devtools-kit/client` `getDevToolsClientContext`, `ensureTrusted`, `rpc.client.register` (`src/client/listeners.ts`, `overlay.ts`, `vite-devtools.ts`) | `connectDevframe` from `devframe/client` (auto-auth) |
| `getDevToolsRpcClient` in the panel (`src/panel/panel.ts`) | `connectDevframe` |
| `declare module '@vitejs/devtools-kit'` RPC/state augmentations | devframe definition-level typing |

### Vite-pipeline surface (needs unplugin / per-host work)

| Today | Portability |
| --- | --- |
| `transform` hook running Babel (React) / SFC prepend (Vue) instrumentation | unplugin `transform` — same code, portable to webpack/rspack |
| `resolveId`/`load` virtual modules (`virtual:component-highlighter/*`) | unplugin virtual-module support |
| `transformIndexHtml` head-prepend devtools-hook bootstrap (CSP-nonced) | **not portable** — replaced by entry-module injection on non-Vite hosts |
| `handleHotUpdate` remap + `server.ws.send('component-highlighter:story-created')` + `import.meta.hot.on` | replaced by devframe events/shared state (transport unification) |
| 6 connect middleware endpoints `/__component-highlighter/*` | replaced by devframe RPC functions (transport unification) |
| `config` mutations: `optimizeDeps`, `resolve.alias`, `resolve.dedupe` (`dedupeReact`) | Vite-only concern; webpack/rspack need host-config equivalents (Next dedupes React itself; Rsbuild via `resolve.alias`) |
| `server.transformRequest` to serve TS runtime in dev | Vite-only convenience; unplugin path bundles the runtime normally |

## Decisions (settled)

1. **Deliverable**: this report + the phased plan below. No tracker tickets.
2. **Motivation**: (a) catch up to the current Vite DevTools (kit 0.6 /
   devframe 0.9) — we are four breaking minors behind; (b) reach non-Vite
   hosts.
3. **Target hosts**: Vite family (plain Vite, Nuxt, Astro, SvelteKit), then
   **Rsbuild**, then **Next.js (webpack, App Router)**. Turbopack is out of
   scope (unplugin does not support it) and will be documented as unsupported.
4. **Back-compat**: clean cut. Drop `@vitejs/devtools` 0.3.x support entirely.
5. **Version policy**: pin `devframe` 0.9.x and use its APIs **directly** (no
   internal adapter layer). Absorb future 0.x migration work as it comes.
6. **Transform delivery**: port instrumentation to **unplugin** — one
   implementation mounted via unplugin adapters for Vite, webpack (Next), and
   rspack (Rsbuild).
7. **Next.js scope**: `next dev` with webpack + App Router. RSC handled by the
   existing `"use client"` transform gate (`rsc` option); the Next playground
   doubles as the currently-missing runtime RSC playground (see `AGENTS.md`).
8. **Packaging**: single npm package with subpath exports (`./vite`,
   `./rsbuild`, `./next`, `./devframe`) — the standard `unplugin-*` layout.
   **The package name stays as-is** (no rename).
9. **Panel UI**: keep the vanilla TS SPA (`src/panel`), shipped as devframe
   `clientAssets`. No JSON-Render rewrite. Only the RPC client wiring changes
   (`getDevToolsRpcClient` → `connectDevframe`).
10. **Transport unification**: full. The 6 middleware endpoints become
    devframe RPC functions; the Vite HMR events (`import.meta.hot`,
    `server.ws.send`) become devframe events/shared state. One transport,
    identical in every host.
11. **Terminals**: keep riding hub terminals. Since every target host mounts
    hub (or Vite DevTools, which embeds it), the Storybook Terminal tab works
    everywhere.
12. **Vite mounting**: **requires `@vitejs/devtools`** (dock via
    `createPluginFromDevframe`, kit ≥ 0.6). No standalone-Vite fallback path.
13. **Non-Vite mounting**: `@devframes/hub` + `@devframes/hub-ui` floating
    dock in-page, mirroring the Vite DevTools experience.
14. **Head-script injection on non-Vite hosts**: the devtools-hook bootstrap
    (must run before React/Vue loads) is prepended as the **first import of
    the app entry** via unplugin (plus Rsbuild's HTML hooks where available),
    with a documented manual `<Script>`/import fallback.
15. **Playgrounds/E2E**: add `playground/rsbuild` (React) and
    `playground/next` (App Router), both wired into the shared E2E suites and
    CI-gated, per repo rules.
16. **MCP**: omitted entirely from this plan.

## Phased plan

Each phase is independently shippable and lands as its own PR (or small PR
series), tests first, with existing playgrounds green throughout.

### Phase 1 — Devframe core migration (Vite-only, feature parity)

Goal: replace the kit-0.3.3 surface with devframe 0.9 / kit 0.6; no new
hosts. Everything in the coupling table's left column moves to the right
column.

- Bump to `@vitejs/devtools` / `@vitejs/devtools-kit` 0.6.x and add
  `devframe@0.9.x`. Walk the published migration guides (0.6 → 0.9):
  required definition metadata, `anonymous:` auth prefix, crossws, schema
  validation changes, 0.9 API trims.
- Introduce `defineDevframe()` with the full RPC table from
  `docs/ARCHITECTURE.md` (server RPCs + client broadcast handlers + shared
  states) and mount in Vite via `createPluginFromDevframe`.
- Ship `dist/panel` as `clientAssets`; rewire `src/panel/panel.ts` and
  `src/client/*` from `@vitejs/devtools-kit/client` to `devframe/client`
  (`connectDevframe`, auto-auth replaces the manual `ensureTrusted` dance).
- **Transport unification**: convert the `/__component-highlighter/*`
  middleware endpoints to devframe RPC functions; replace
  `component-highlighter:story-created` HMR event and `import.meta.hot`
  listeners with devframe events/shared state.
- Terminals (Storybook process), messages, diagnostics, and commands move to
  their hub/devframe equivalents.
- Update `AGENTS.md` (interactive-QA instructions: dock element, auth
  snippet), `docs/ARCHITECTURE.md` (RPC table, endpoints, globals), and
  `README.md` (peer requirements: `@vitejs/devtools >= 0.6`).
- Exit criteria: `pnpm test` + full Playwright suite green on all existing
  playgrounds (React 18/19, Vue); manual panel QA per `AGENTS.md` passes.

Risks: auth/trust flow differences; shared-state semantics under reconnect;
CSP-nonce handling for injected scripts under the new host.

### Phase 2 — unplugin refactor (Vite still the sole consumer)

Goal: re-platform instrumentation delivery without changing behavior.

- Move `transform`/`resolveId`/`load` logic into an unplugin factory; keep
  Vite-specific niceties (e.g. `server.transformRequest` dev-source serving,
  `optimizeDeps`/`resolve` mutations) in the Vite adapter only.
- Replace `transformIndexHtml` with a dual strategy: keep HTML injection on
  Vite; implement entry-module injection as the portable path (behind a
  flag, exercised by unit tests now, by new hosts in Phases 3–4).
- Restructure exports: `./vite` (existing entry, now unplugin-backed),
  `./devframe` (the raw definition), placeholders for `./rsbuild`, `./next`.
- Exit criteria: zero behavior change on Vite playgrounds; transform unit
  tests (`src/frameworks/*/transform.test.ts`) unchanged and green.

Risks: virtual-module id conventions differ across bundlers (`\0` prefix
handling); HMR-adjacent behavior (`handleHotUpdate`) must stay Vite-side.

### Phase 3 — Rsbuild host

Goal: first non-Vite host, chosen because rspack's transform surface is
closest to Vite's and there is no RSC axis.

- `./rsbuild` subpath: unplugin rspack adapter + `@devframes/hub` mounted on
  Rsbuild's dev-server middleware + `@devframes/hub-ui` floating dock.
- Devtools-hook bootstrap via Rsbuild HTML hooks (preferred) with
  entry-injection fallback.
- React dedupe/alias equivalents via Rsbuild `resolve` config guidance.
- Add `playground/rsbuild` (React, mirroring `playground/react` component
  structure) and wire it into `e2e/common-highlighter-suite.ts`; CI-gated.
- Update `docs/SUPPORTED_FRAMEWORKS.md` with a hosts dimension.
- Exit criteria: shared E2E suite green on Rsbuild; both save flows
  (`Create`, `Create with Interactions`) verified.

Risks: rspack loader ordering vs unplugin transform stage; no
`server.transformRequest` equivalent (bundle the runtime instead).

### Phase 4 — Next.js host (webpack, App Router)

Goal: highest-value, highest-risk host; also closes the runtime-RSC coverage
gap called out in `AGENTS.md`.

- `./next` subpath: `next.config.js` wrapper applying the unplugin webpack
  adapter to client compilations only (skip the server/RSC compilation),
  mounting hub via a route handler (`@devframes/next` pattern), and injecting
  the hook bootstrap as the first client-entry import (documented manual
  `<Script>` fallback).
- RSC: run the transform with `rsc: true` — instrument only modules behind
  the `"use client"` gate; server components appear in coverage as
  non-instrumentable (documented).
- Story generation targets Storybook's Next framework
  (`@storybook/nextjs`) in the generator's `storybookFramework` mapping.
- Add `playground/next` (App Router, mix of server + client components —
  this becomes the missing `rsc: true` runtime playground) and wire it into
  the shared E2E suite; CI-gated.
- Document turbopack as unsupported (unplugin has no turbopack adapter).
- Exit criteria: shared E2E suite green on Next; RSC boundary behavior
  covered by both unit tests and the playground.

Risks: webpack HMR interplay with the registry runtime; React version/dedupe
inside Next; `next dev` default-turbopack drift in future Next majors (must
document `--webpack`-style opt-outs as Next evolves).

## Out of scope

- Turbopack, browser-extension viewers, standalone CLI/dev-server mode.
- MCP/agent exposure of RPC functions.
- Package rename.
- Supporting `@vitejs/devtools` < 0.6 after Phase 1 lands.
