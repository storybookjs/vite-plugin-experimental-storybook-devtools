# AGENTS.md

Guidance for AI coding agents working in this repository.

## Goals

- Ship minimal, correct changes.
- Preserve cross-framework parity (React + Vue playgrounds).
- Prove behavior with tests before claiming completion.

## Working Rules

1. **Start with tests, not assumptions**
   - If behavior changes, add/update tests first.
   - Prefer extending shared e2e helpers/suites over duplicating spec logic.

2. **Keep React and Vue playgrounds aligned**
   - Component naming and app structure should stay equivalent when possible.
   - If one playground changes, review whether the other should match.

3. **Use shared test primitives**
   - Reuse:
     - `e2e/highlighter-helpers.ts`
     - `e2e/common-highlighter-suite.ts`
   - Keep framework-specific specs focused on true framework differences only.

4. **Verify both save flows**
   - `Save Story`
   - `Save Story with Interactions`
   - Ensure interaction recording is exercised with real form input/select actions.

5. **Make CI reliable**
   - Avoid relying on manual Vite DevTools authorization in CI.
   - Keep E2E activation deterministic (automation hooks + config).

6. **Do not leave docs stale**
   - If you change architecture, testing strategy, or workflow, update:
     - `AGENTS.md`
     - `docs/AGENT_PLAYBOOK.md`
     - PR checklist/template if needed

## Required Validation Before Handoff

Run relevant checks (at minimum):

```bash
corepack pnpm test tests/frameworks/react/playground-story-generation.test.ts tests/frameworks/vue/playground-story-generation.test.ts
corepack pnpm exec playwright test e2e/playground-react-detection.spec.ts e2e/playground-vue-detection.spec.ts
```

If you touch broader behavior, run the full test set impacted by your changes.

## PR Hygiene

- Keep PRs focused (tests PR vs implementation PR when useful).
- In PR description include:
  - What changed
  - Why
  - Exact commands run
  - Any caveats/follow-ups
- If stacked PRs are used, explicitly document base/head relationships.
