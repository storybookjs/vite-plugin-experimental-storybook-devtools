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

- Put reusable logic in shared helpers/suites.
- Keep framework-specific specs small.
- Validate real UI behavior (hover, click, context menu, save actions), not just internals.
- For interaction recording, use realistic user actions on form controls.

## 4) CI Stability Principles

- Avoid test flows needing manual trust prompts.
- Keep deterministic activation paths for highlight tooling.
- Keep web server config explicit (host/port/framework project mapping).

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
- Docs are updated if behavior/workflow changed.
- PR description contains reproducible verification commands.

## 7) Documentation Freshness Contract

Any PR that changes behavior, architecture, or test strategy must update docs accordingly.

Minimum docs to review each PR:

- `AGENTS.md`
- `docs/AGENT_PLAYBOOK.md`
- `docs/ARCHITECTURE.md`
- `docs/SUPPORTED_FRAMEWORKS.md` (when framework support changes)
- `.github/pull_request_template.md`
