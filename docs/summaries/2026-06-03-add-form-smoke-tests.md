# Add live smoke tests for four more forms

## Goal

Add live smoke specs for `textbook-grant-application`,
`homeschooling-application-2024`, `duties-performed-exam-claim`, and
`referral-student-support-services`, on the shared smoke infrastructure from
#638, and wire them post-deploy. Target state: every spec passes and each form
reaches the submission-confirmation screen; any form that can't get there is
logged here.

## Outcome

| Form | Status | CI-wired (post-deploy) |
|------|--------|------------------------|
| `textbook-grant-application` | ✅ passes against sandbox | yes |
| `duties-performed-exam-claim` | ✅ passes against sandbox | yes |
| `referral-student-support-services` | ⛔ blocked (`test.fixme`) | no |
| `homeschooling-application-2024` | ⛔ blocked (`test.fixme`) | no |

Two pass and are wired into `deploy-sandbox.yml` via the reusable
`forms-smoke.yml`. Two are blocked by a recipe bug on the deployed forms (below),
written as `test.fixme` so the suite stays green and they're ready to enable
once fixed.

## How the specs were authored

Each spec was written from the **deployed** contract (fetched from
`forms.api.sandbox.alpha.gov.bb/form-definitions/<id>`) and then **run against
sandbox and iterated to green** — the only reliable way, because the in-repo
recipes drift from what's served. Findings that shaped the specs:

- **Requiredness drift.** Several recipes declare requiredness in the wrong
  place (a top-level `"required"` flag instead of `validations.required.value`).
  The hydrator ignores the misplaced flag and defaults fields to **required**,
  so the deployed forms require fields the recipe marks optional. The specs
  therefore fill *every* text/select/radio field, not just recipe-required ones.
- **`minLength: 2` on everything.** Single-character values (`"1"`, the `#`
  column) fail validation; numeric fields need ≥2 chars (`"01"`).
- **Selects, repeatables, dates.** `generic-select` renders a native `<select>`
  (added a `selectDropdown` helper); repeatable steps render inline with an
  "Add another?" radio (`addAnother` → `no`); `type: date` on `generic-text`
  renders as a plain text input (ISO string), while a real `generic-date`
  renders the three-part day/month/year widget (`fillDate`).
- **No `check-your-answers`.** Unlike the original three forms, these four don't
  inject a review step; the specs guard for it defensively anyway.
- **Confirmation.** All reach an `h1` of "Submission Confirmation"; none of the
  four render a reference-number block, so the specs assert the heading + the
  "Your submission has been saved" message only.

## Blocked forms — root cause (the "can't fix" log)

Both blocked forms hit the **same deployed-form bug**: one or more `checkbox`
fields are served with `required: true` but **`options: []`**. The
field-renderer (`apps/forms/src/components/field-renderer.tsx`) draws one
checkbox input per option, so an options-less checkbox renders **no checkable
input** — yet validation demands a value. Those steps cannot be completed
through the UI, so the form cannot be submitted.

- **referral-student-support-services** — 17 such fields across
  `additional-difficulties-challenges` (7), `involvement-with-outside-agencies`
  (9), and `referral-details.parent_consulted` (1). Recipe marks them
  `"required": false`, but via the misplaced-flag drift they're served required.
  *Likely fix:* give those checkboxes proper requiredness
  (`validations.required.value: false`) so they're genuinely optional.
- **homeschooling-application-2024** — `declaration-and-signature.acknowledge_requirements`,
  a single acknowledgement checkbox, is `required: true` with empty options.
  *Likely fix:* give it a single option (the pattern the temp-teacher
  declaration uses, `confirmed`). Secondary issue: its required uploads accept
  only `.pdf/.doc/.docx/.xls/.xlsx`, and the repo has only PNG/txt fixtures, so a
  document fixture is needed before its spec can pass.

Both are **recipe/data bugs, not test bugs**, and fixing them is a product change
to the form definitions (what's required, which options) plus a redeploy — out
of scope for "add smoke tests". The specs are complete and marked `test.fixme`
with the blocker documented in-code; remove the `test.fixme` once the recipes are
fixed and deployed. Recommend filing an issue to correct these recipes (and to
audit other recipes for the same misplaced-`required` / empty-options pattern).

## Files

- Add: `apps/forms/e2e/smoke/textbook-grant-application.smoke.spec.ts`
- Add: `apps/forms/e2e/smoke/duties-performed-exam-claim.smoke.spec.ts`
- Add: `apps/forms/e2e/smoke/referral-student-support-services.smoke.spec.ts` (`test.fixme`)
- Add: `apps/forms/e2e/smoke/homeschooling-application-2024.smoke.spec.ts` (`test.fixme`)
- Modify: `apps/forms/e2e/helpers/smoke.ts` (add `selectDropdown`)
- Modify: `.github/workflows/deploy-sandbox.yml` (two new caller jobs; note on the blocked two)

## Verify

- `SMOKE_BASE_URL=https://forms.sandbox.alpha.gov.bb pnpm --filter @govtech-bb/forms exec playwright test --config playwright.smoke.config.ts <spec>` — textbook + duties pass; referral + homeschooling report skipped.
- `nx run-many -t build --exclude=landing` and `-t test` stay green (685 passed, 1 skipped).
- Each passing run files a real submission to `testing@govtech.bb` (duties + textbook have email processors).
