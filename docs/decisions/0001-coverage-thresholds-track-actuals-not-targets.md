# 0001 — Coverage thresholds track actuals, not targets

**Date:** 2026-05-19  
**Status:** Accepted

## Context

When wiring up Jest coverage tooling across the monorepo (Phase 1 of the testing improvements plan), the initial plan specified aspirational threshold values (90% for mature packages, 75% for the API, 50% for form-types). Actual measurements came in below those figures in several dimensions:

| Workspace | Metric | Plan | Actual |
|---|---|---|---|
| `apps/api` | branches | 70% | 60.97% |
| `apps/api` | functions | 75% | 65.07% |
| `packages/form-conditions` | branches | 90% | 84.9% |
| `packages/form-validation` | branches | 90% | 89.2% |
| `packages/form-types` | functions | 50% | 6.52% |
| `apps/web` | all | 50–60% | 0–22% |

Setting thresholds above actuals would cause every CI run to fail immediately, defeating the purpose of the tooling.

## Decision

**Coverage thresholds are always set just below measured actuals, not at aspirational targets.**

Concretely: when adding or updating a `coverageThreshold`, measure the real coverage first, then set the threshold 1–2 percentage points below the measured value. The threshold's job is to catch _regressions_, not to declare an aspiration.

Aspirational targets belong in the testing plan and coverage targets table — not in `jest.config.ts`.

## Consequences

- Thresholds will start low and tighten incrementally as new tests are added. Each PR that adds tests should raise the threshold to match the new floor.
- A threshold failure in CI means coverage _dropped_ from a known baseline — a genuine regression signal, not a "we haven't written enough tests yet" signal.
- Plan documents (like `docs/superpowers/plans/`) may specify target coverage levels for future sprints. Those targets are planning tools; they only become thresholds once the tests exist to meet them.
- Reviewers should reject PRs that lower a threshold without a documented reason (e.g. deleting a tested file is acceptable; quietly suppressing a regression is not).
