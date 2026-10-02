# Session summary — Exit-survey confirmation + email (#2133)

**Date:** 2026-07-31 · **Branch:** `feat/exit-survey-confirmation` (off `main`) ·
resolves #2133

## What shipped

Two changes to the **Exit Survey** ([exit-survey.json](apps/api/src/forms/form-definitions/recipes/exit-survey.json)):

1. Its confirmation page now matches the Figma — heading **"Thank you for your
   feedback"**, a success subheading, a body paragraph, and a **What happens
   next** section with a `return to alpha.gov.bb` link. The false
   "you will receive a confirmation email" copy is gone (the survey collects no
   email), and the **Submission ID is hidden** (anonymous survey, no meaningful
   reference).
2. An **email processor** delivers each response to `feedback@govtech.bb`.

## Why it looks the way it does

- **Body via `markdownContent`, not `nextSteps`.** The design's "What happens
  next" is multiple paragraphs plus a link. `nextSteps.content` renders as a
  single plain-text `<p>` (no markdown, no link), so it can't express that;
  `markdownContent` renders full markdown. So the whole confirmation body moved
  to `markdownContent` and the `nextSteps` block was dropped.

- **New `hideReferenceNumber` step flag — the one renderer gap.** The no-payment
  confirmation renders a "Submission ID" whenever a reference exists, and every
  submission has one, so recipe copy alone couldn't match the design (which
  shows none). Added an optional `hideReferenceNumber` to `formStepSchema`
  (form-types), plumbed through `form-renderer` → `SubmissionConfirmation`, and
  gated the `<dl>`. Opt-in and reusable for any anonymous form; omitted ⇒ the ID
  shows exactly as before. This gap was flagged on the issue before
  implementing, per its instruction.

- **Literal email recipient.** The processor's `recipientField` is a literal
  `feedback@govtech.bb` (a supported mode alongside `stepId.fieldId` and the MDA
  token — ADR 0032). A literal avoids adding a `contactDetails` block to the
  recipe, which would render an unwanted "If you need help… contact:" section on
  the confirmation. The subject is **literal only** (the processor doesn't
  interpolate answers), so the reviewed service name (`referring-service`)
  appears in the emailed submission-summary body, not the subject.

- **Return link hardcoded** `https://alpha.gov.bb` in the recipe copy — static
  recipe JSON can't read the app's `LANDING_URL` env, and the design text is
  literally "alpha.gov.bb". Fine for prod/sandbox; won't follow
  `VITE_LANDING_URL` preview overrides.

## Conventions / notes

- **Recipe is a flat file edited in place** (`recipes/exit-survey.json`, #1196),
  not a versioned `recipes/<id>/<version>.json` dir. The in-place edit needs the
  **`recipe-version-override`** label on the PR (recipe-immutability CI rule).
- The repo's `form-design` skill still documents the old versioned-dir + Jest
  workflow; the live conventions are flat files + Vitest + `pnpm validate-recipes`.
  Worth updating that skill.
- Two AC items are **sandbox-only**: a real email arriving at
  `feedback@govtech.bb` and a `notification_log` row with the resolved recipient
  — verifiable after deploy.

## Verification
`pnpm validate-recipes` (76 ✓) · `nx run api:test` (1238 ✓, coverage met) ·
`nx run forms:test` (799 ✓) · `nx run form-types:test` (457 ✓) · lint clean.
New tests: the schema flag (form-types) and the hidden-Submission-ID render
(forms confirmation spec).
