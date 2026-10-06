# State land: apply the content review (#2914)

## Context

A content review of "Application to Use State Land" (1 October 2026) asked
for a new journey, start page and confirmation wording. Content also supplied
builder instructions with exact copy. The review had been done against
something other than the live recipe: main, sandbox and prod all lacked the
citizenship gates, "Name of the place" field and NHC/10-working-day wording it
asked us to remove. The mismatches were listed for content on the issue before
any build started.

## What we did

- Rebuilt `mohlm-application-use-state-land.json` around "Who are you applying
  for?" with route-specific Your details / Organisation details + Contact
  person, a no-permission stop step, a shared "How should we contact you?"
  step, land with or without an address, and an optional end date. Pinned it
  with `mohlm-application-use-state-land.spec.ts`.
- Rewrote `apply-to-use-state-land.md` (title, routes, cost, next steps).
- Fixed `getStepConditonalTargets` in `apps/forms` so a step conditional on
  several fields of one earlier step re-evaluates when any of them changes.
- Added a three-route smoke spec.

## Why we did it that way

- **Builder instructions as the spec, minus what doesn't exist.** The review's
  "remove X" items had nothing to remove, so we built the proposed journey and
  skipped them rather than guess what the reviewers saw. Where content's issue
  comment and the builder instructions disagreed (declaration wording, photo
  upload), Fab's comment won; the photo upload stays until the Ministry says
  it isn't needed.
- **Contact details on one shared step, not inside each route.** The email
  processor reads exactly one `stepId.fieldId` and has no condition. With the
  email on `your-details` *or* `contact-person`, a second processor would fail
  `NO_RECIPIENT` on every submission. The user chose a shared step over a
  processor change (API work) or accepting the noise. This departs from the
  builder layout.
- **Route condition repeated on downstream gates.** Hidden answers are never
  cleared, so a stale "No" to permission would strand a self-route applicant
  on the stop step. `no-permission` and `relationship-to-organisation` also
  require `applying-for = organisation`. The server drops hidden steps'
  values, so nothing stale is stored or emailed.
- **Renderer fix over a recipe workaround.** The smoke walk showed the stop
  step never appeared: the client kept one watched field per target step, so
  `has-permission` was overwritten by `applying-for`. Moving permission to its
  own page would have dodged it, but left the bug for the next form and added
  a page the spec didn't have. The server's own evaluation was never affected.
- **Start page headings from the content prompt, wording from the spec.** The
  builder's "How to apply" / "What happens next" headings break the
  licence/application pattern's hard rules, so the wording was poured into
  that pattern's headings. A `keywords: [state land]` entry keeps the
  search-relevance case for "state land" passing after the retitle.
- **Postal code is plain text**, because the registry postcode only accepts
  Barbados postcodes and addresses can now be overseas.

## What we almost got wrong

- The plan said no smoke spec was needed because the form is `preview`; the
  form-design skill requires one whenever a form's shape changes. Writing it
  is what found the renderer bug.
- A reviewer flagged Country as optional; the registry component is required,
  so it was dropped as a false positive.

## Open questions

- MDA: an identifier for applicants without a Barbados NRN; whether an
  organisation registration number is needed. No fields added.
- Content: whether the photo upload stays; the paper form's download URL.
- Platform limits left as they are: no calculated duration; Check your
  answers groups by page with one Change link per section; Change doesn't
  return to Check your answers (#2812); stop pages use the jobstart workaround
  (#2618).
- The recipe has no MDA notification processor (true before this change too).
- Pre-existing renderer quirks: conditions with no `targetStepId` are never
  watched, and the change key joins values with `|`.
