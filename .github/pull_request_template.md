## Summary

<!-- What changed? -->

## Why

<!-- Why is this needed? -->

## Scope

- [ ] React impact considered
- [ ] Vue impact considered
- [ ] Shared e2e helpers/suite reused where possible

## Validation

<!-- Paste exact commands and results -->

```bash
# Example
corepack pnpm test tests/frameworks/react/playground-story-generation.test.ts tests/frameworks/vue/playground-story-generation.test.ts
corepack pnpm exec playwright test e2e/playground-react-detection.spec.ts e2e/playground-vue-detection.spec.ts
```

## Documentation

- [ ] Updated `AGENTS.md` if workflow/expectations changed
- [ ] Updated `docs/AGENT_PLAYBOOK.md` if process changed
- [ ] Added/updated inline comments for non-obvious logic

## PR Type

- [ ] Tests-only
- [ ] Implementation
- [ ] Docs
- [ ] Refactor

## Notes for Reviewers

<!-- Caveats, follow-ups, stacked PR context -->
