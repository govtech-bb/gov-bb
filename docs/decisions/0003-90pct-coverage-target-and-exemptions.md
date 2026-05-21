# 0003 — 90% coverage target, exemptions, and threshold ratchet policy

**Date:** 2026-05-20  
**Status:** Accepted

## Context

After completing Phases 1–4 of the testing improvements plan, the project has working Jest coverage tooling across all six workspaces (`apps/api`, `apps/web`, `packages/expressions`, `packages/form-conditions`, `packages/form-types`, `packages/form-validation`). The next step is to drive all workspaces toward a shared quality target and to document the exceptions that prevent uniform enforcement.

Two structural constraints emerged from Phase 1–4 measurements:

1. **`packages/form-types` functions coverage is structurally capped.** This package exports Zod schema objects (`z.object(...)` calls), not callable runtime functions. Jest counts each schema definition as a "function" only if it is invoked during tests; since schemas are composed rather than called, the measured functions coverage is 6.52% regardless of how thoroughly the schema shapes are tested via `parse`/`safeParse`. Adding more schema tests does not raise this number.

2. **`apps/web` functions coverage target requires a scope decision.** After Phase 3 measurements, the functions ceiling depends on whether `form-renderer.tsx` and the main form route (`routes/forms/$formId/index.tsx`) are brought into unit test scope. Both components require simultaneously mocking TanStack Query, React Router, and draft state; testing them at unit level risks testing the mocks rather than the components. The Playwright E2E suite provides reliable journey coverage for those paths. Until Phase 3 measurements are taken and a scope decision is made, a uniform 90% functions target for `apps/web` cannot be enforced.

## Decision

**The project-wide coverage target is 90% statements, branches, functions, and lines**, with the following documented exemptions:

### Exemption 1 — `packages/form-types` functions

The functions threshold for `packages/form-types` is set to 5% (floor) rather than 90%. This is a permanent structural exemption: the package exports Zod schema objects, not callable functions. The measured floor is 6.52%. This threshold must not be raised unless runtime utility functions are intentionally added to the package.

### Exemption 2 — `apps/web` functions target deferred

The functions threshold for `apps/web` is deferred pending a scope decision on `form-renderer` after Phase 3 measurements. The target of 90% applies to statements, branches, and lines. Once Phase 3 measurements are taken, the functions threshold will be set according to the ratchet policy (measured actual minus 1–2 points), and the scope decision will be documented in a follow-up record if a permanent exemption is warranted.

### Threshold ratchet policy

Thresholds are raised after each session that improves coverage; they are never set to a future target upfront. When actual coverage improves, update the `coverageThreshold` in `jest.config.ts` to sit 1–2 percentage points below the new measured value. This ensures the threshold catches genuine regressions without blocking progress.

This policy extends and operationalises the approach established in `0001-coverage-thresholds-track-actuals-not-targets.md`.

## Consequences

- Every workspace must have `coverageThreshold` configured in its `jest.config.ts`. A workspace without a threshold is outside the quality gate.
- PRs that add tests should update the relevant thresholds to reflect the new floor. PRs that lower a threshold without a documented reason should be rejected.
- `packages/form-types` reviewers must not raise the functions threshold as a proxy for "more tests needed" — the metric is structurally inert for this package. Statement and line coverage are the meaningful signals.
- Once `apps/web` Phase 3 measurements are complete, a follow-up task must set the functions threshold and, if the scope decision excludes `form-renderer`, create a new decision record documenting that exemption. Update the status of Exemption 2 to either "resolved" (threshold set) or "permanent" (new decision record created). Do not leave the deferral open indefinitely.
- The 90% target applies to all future packages added to the monorepo. New packages must have coverage tooling configured before their first merge to main.
