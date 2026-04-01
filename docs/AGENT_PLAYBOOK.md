# Agent Playbook

Operational playbook for AI agents and maintainers.

## 1) Task Triage

When receiving a request:

- Classify change type:
  - docs-only
  - tests-only
  - implementation
  - refactor
- Prefer one PR containing both tests and implementation (tests-first within same PR).
- Identify cross-framework impact across supported frameworks (see `docs/SUPPORTED_FRAMEWORKS.md`).

## 2) Tests-First Strategy

Prefer this sequence:

1. Add/adjust tests to describe expected behavior.
2. Confirm tests fail for the old behavior (when practical).
3. Implement change.
4. Re-run tests and capture commands/output.

## 3) E2E Design Principles

- Put reusable logic in shared helpers/suites (`e2e/highlighter-helpers.ts`, `e2e/common-highlighter-suite.ts`).
- Keep framework-specific specs small — only test true framework deltas.
- Validate real UI behavior (hover, click, context menu, save actions), not just internals.
- For interaction recording, use realistic user actions on form controls.
- Context menu elements use Shadow DOM — key elements have stable IDs for E2E (see `docs/ARCHITECTURE.md`).

## 4) CI Stability Principles

- Avoid test flows needing manual trust prompts.
- Keep deterministic activation paths for highlight tooling (use `__componentHighlighterEnable()` and similar automation hooks).
- Keep web server config explicit (host/port/framework project mapping in `playwright.config.ts`).

## 5) Validation Commands

Use simple, stable commands by default:

```bash
pnpm test
pnpm exec playwright test
```

If a change is scoped, run targeted subsets too, but do not skip the relevant baseline checks.

## 6) Definition of Done

A change is done only when:

- Code is implemented.
- Relevant tests pass locally.
- Docs are updated if behavior/workflow changed (see list in `AGENTS.md` rule 6).
- PR description contains reproducible verification commands.

## 7) Documentation Freshness Contract

Any PR that changes behavior, architecture, or test strategy must update docs accordingly **in the same change**. Do not defer documentation updates — stale docs cause compounding errors for future agents and contributors.

Minimum docs to review each PR:

- `README.md`
- `AGENTS.md`
- `docs/ARCHITECTURE.md`
- `docs/AGENT_PLAYBOOK.md`
- `docs/SUPPORTED_FRAMEWORKS.md` (when framework support changes)
- `.github/pull_request_template.md`
