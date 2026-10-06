# NHC rental home or house lot: content review (#2913)

## Context

The 1 October 2026 content review of `nhc-rental-application` asked for a redesigned journey. It covered:

- choosing a rental home or a house lot, and 1 or 2 applicants, up front
- an early citizenship check
- an income check that converts each person's pay to a monthly amount and adds the two together
- shared-address reuse for the second applicant
- no TAMIS
- a single confirm-and-submit page

The content designer's "Build instructions" were the wording source. Eight NHC questions are still open.

## What we did

- Rewrote the start page `apps/landing/src/content/apply-for-an-nhc-rental-unit-or-lot.md` (same slug) and regenerated `services-index.generated.ts`.
- Rewrote `recipes/nhc-rental-application.json` into a 17-step journey. The steps follow the spec, apart from the deliberate deviations listed under "Why".
- Added `nhc-rental-application.spec.ts`. It pins the routes, stops, caps and confirmation tokens on the **hydrated** contract, evaluated with `@govtech-bb/form-conditions`.
- Walked the main routes and every stop in a local browser.

## Why we did it that way

- **Recipe only, no engine work (user decision).**
  - The engine can't do arithmetic across fields, so the summed, frequency-normalised income rule can't be built yet.
  - Instead, frequency is asked **before** the amount. One amount field per frequency then carries its own literal `max`: weekly 692.30 (3000 × 12 ÷ 52, rounded down), twice a month 1500, monthly 3000.
  - A `max` can't vary with another answer; only visibility can. That is why there are three fields and why the order is reversed from the spec.
  - Joint applications add a self-declared "total you both receive" Yes/No on top of the per-person caps.
- **Other engine limits we accepted rather than worked around.** These are follow-up engine work:
  - Change links don't return to Check your answers.
  - Check your answers sections can't be custom-grouped.
  - The submit button text is fixed as "Submit".
  - Household size can't be calculated.
  - Hints can't be conditional, so "Give the amount before deductions." shows for every income type.
  - Options can't have hints, so the house-lot hint sits on the question.
- **Relationship (user decision).**
  - The spec asked for free text. The guardrails require the `components/relationship` select.
  - We used the select plus a free-text field shown when the answer is "Other".
- **Occupants.**
  - A repeatable step needs `min ≥ 1` and a numeric `max`.
  - So there is a gate question ("Will anyone else live in the rental home?") and `max: 20`. Setting max below min would also mean "unlimited" in the renderer, but that relies on undocumented behaviour, so we didn't use it.
- **Shared confirmation body.**
  - The confirmation page's `markdownContent` *is* the email body (`email-body.builder.ts`).
  - So the spec's separate page and email texts were merged into one, with `conditionalMarkdown` tokens for the application type and the rental-only waiting-list sentence.
- **Errors.**
  - Validation overrides replace a whole rule; they are merged one rule key at a time.
  - So we only overrode errors where the rule could be stated without copying a registry value: required, and `min` on the generic number fields.
  - The maiden-name `minLength`/`pattern` errors still say "Name …". Fixing them would mean copying the registry's own rules into the recipe.

## What we almost got wrong

- `pnpm validate-recipes --write` canonicalised **all 90** recipes, not just the target one. Never run it with `--write` for a single-recipe change. The other 81 files were restored before committing.
- The second applicant's over-limit error first reused the single-applicant "the amount you receive" text, which named the wrong person. The review caught it, because the spec only regex-matched the error.

## Open questions

- NHC questions Q1–Q8 (listed in the PR and on #2913).
- Pay frequency:
  - The issue says the stored "Bi-monthly" value stays, but the old recipe stored `fortnightly`. We now store `twice-a-month` (×2).
  - There is no fortnightly option, so a fortnightly earner under-reports against the twice-a-month cap.
- There is no "not working" income type (for example an unemployed applicant or a non-working spouse).
- "Allow about 20 minutes" was dropped from the start page because the spec omits it.
- The house-lot route still needs checking against `nhc-land-property-application` for overlap.
- The form has no smoke spec.
