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
   - Keep `docs/SUPPORTED_FRAMEWORKS.md` current.

3. **Use shared test primitives**
   - Reuse:
     - `e2e/highlighter-helpers.ts`
     - `e2e/common-highlighter-suite.ts`
   - Keep framework-specific specs focused on true framework differences only.

4. **Verify both save flows**
   - `Create` (story with current props)
   - `Create with Interactions` (story with recorded play function)
   - Ensure interaction recording is exercised with real form input/select actions.

5. **Make CI reliable**
   - Avoid relying on manual Vite DevTools authorization in CI.
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
