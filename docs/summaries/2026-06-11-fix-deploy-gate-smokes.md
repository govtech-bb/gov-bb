# Unblock the sandbox deploy: two red post-deploy smokes

Branch: `worktree-fix-textbook-and-protege-smokes` → PR target `sandbox`
Related: [#826](https://github.com/govtech-bb/gov-bb/issues/826) (smoke-drift class)

## Context

Every push to `sandbox` was failing in `deploy-sandbox.yml`'s post-deploy smoke
matrix (`forms-smoke.yml`, run against `forms.sandbox.alpha.gov.bb`). Two specs
were red and gating the deploy:

- `get-a-primary-school-textbook-grant.smoke.spec.ts`
- `project-protege-mentor.smoke.spec.ts`

Both are post-deploy gates (ADR 0027) — they drive the real deployed form and
submit for real, so a published form that drifts from its smoke breaks the gate
with no repo change to point at.

## What we did

**textbook-grant — fixed the smoke (the form change was intentional).**
The v1.7.0 school-email feature ([#1213], summarised
`2026-06-11-textbook-grant-school-email-routing.md`) made `child-school` and
`child-principal-name` `sharedFields` on the repeatable `child-details` step.
The live renderer (`repeatable-helper.ts → setupRepeatSteps`) materialises a
`sharedFields` repeatable step into **two pages**: a base shared-values page
(all per-child fields *plus* the shared ones, no `addAnother`) and a
`child-details~1` instance page (per-child fields *minus* the shared ones, *plus*
the `addAnother` radio). The old smoke answered `addAnother` on the base step,
where it no longer renders → timeout. The smoke now walks both pages, sets the
shared school/principal only on the base page, and answers `addAnother` on `~1`.
**Verified green live against sandbox.**

**project-protege-mentor — fixed the recipe (a regression).**
The smoke failed on the `applicant` step with three "required" errors
(`institution-name`, `employer-name`, `other-employment-details`) even though it
selected `employment-status = "unemployed"`. Investigation showed the v1.1.0
republish (commit `310951ee`) silently stripped the `fieldConditionalOn`
behaviours from **six** fields — the three above plus `mentee-phone-number`,
`mentee-in-mind-name`, `years-of-experience` — turning conditional fields into
unconditional required ones. That breaks the form's UX, not just the test.
Published `1.2.0.json` restoring exactly those six conditionals (keeping 1.1.0's
benign improvements: the explicit `check-your-answers` step, the `relationship`
component swap, the parish default). The smoke is **unchanged** — it already
encoded the correct contract and is what caught the regression.

## Why we did it that way

- **Smoke vs recipe is a triage call, not a default.** A red deploy smoke means
  "deployed form ≠ smoke's contract." The right side to change depends on which
  one is wrong: textbook's split was a deliberate feature (fix the smoke);
  protege's dropped conditionals were an accident (fix the recipe). Conforming
  the protege smoke to the regressed form would have shipped a broken form.
- **Fix forward with a new version, not an in-place edit.** Recipes resolve by
  latest semver (`recipe-file-loader.service.ts`, filename must equal
  `recipe.version`), so `1.2.0.json` cleanly supersedes `1.1.0` without mutating
  a published version.
- **Ground-truth the renderer before editing a smoke.** The two-page
  `sharedFields` behaviour isn't obvious from the recipe JSON. A throwaway
  `_explore.smoke.spec.ts` walked the live form dumping each step's input ids,
  which revealed the exact base/`~1` field split; then deleted.

## Verification

- textbook smoke: green live against sandbox (real submission → confirmation;
  the `schoolEmail` processor resolved `all-saints-primary`).
- protege recipe: full `api` suite green (791 tests, incl. `recipe-invariants`
  and `recipe-file-loader`); `tsc -b` clean; `api` + `forms` build clean. Its
  live-green is inherently post-deploy — sandbox still serves the regressed
  1.1.0 until this merges.

## Open questions

- The protege conditionals were dropped *by a form-builder republish*. Restoring
  them in recipe JSON is a forward fix, but the next republish from the
  still-regressed builder state could strip them again — the systemic drift
  tracked by #826. A reconcile of builder state would prevent recurrence.
- `apps/forms/test-results/` (Playwright output) is not gitignored — pre-existing,
  not addressed here.
