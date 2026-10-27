# Hotel and lodging licences: warning notices, short declaration, owner details step

2026-10-05 · Forms · #2918, #2920, #2921 (#2919 held)

## Context

Four small issues compared the hotel and lodging house or barracks licence
recipes. Environmental Health's content designer commented on each one. On two
of them, the comments changed the issue's stated decision.

## What we did

- **#2918:** the lodging form's six "you must also apply for…" notices on
  `amenities-other` are now `warning` callouts. They use the agreed EH wording,
  "…before the lodging house or barracks licence can be granted".
- **#2920:** both forms use the short declaration, "I confirm that the
  information I have provided is true and correct to the best of my
  knowledge.", under the heading "Confirm and submit your application". The
  error is "You must confirm the declaration to continue."
- **#2921:** on the lodging form, the owner's name, business name and address
  moved from `property-owner-details` (retitled "Property ownership") to a new
  `owner-details` step. That step is shown with `stepConditionalOn
is-property-owner = no`.
- The lodging smoke spec now walks the new step, expects the warning class and
  checks the new heading.

## Why we did it that way

**#2920 went the opposite way from the issue.** The issue said to move hotel
onto lodging's long declaration, because 45 recipes use it. The content
designer said the short wording is the agreed standard, and that the long one
is an old platform pattern carried over. Their rules: use the short wording on
Environmental Health forms unless a service has a real reason not to, and put
any legal or service-specific acknowledgement in a separate element, never in
the declaration. The Form Builder system prompt's declaration example still
uses an older short wording. It is not aligned yet.

**#2921 uses a new step, not a renderer flag.** The forms renderer places any
same-step field that depends on a radio answer inside that option
(`buildFieldGroups` in `form-renderer.tsx`). It only does this for the
`equal` operator or a single-value `in`. The owner fields depended on
`owner-type`, so the three name fields sat between "A person" and "A business
or organisation". We considered three fixes:

- A recipe flag that puts a reveal after the question. It works, but it
  touches form-types, the renderer and the builder schema to fix one form.
- Rewriting the condition as `notEqual business`, which the renderer doesn't
  nest. That shows the name fields before `owner-type` is answered, and it
  reads as a hack.
- Moving the fields to their own step. A cross-step condition is never
  nested, so this fixes the layout with recipe changes only.

We moved the fields. The cost is the webhook payload. The MDA webhook uses
`groupByStep`, so the owner fields now arrive under an `owner-details` group.
The PR has to say so. The step-level gate replaces each moved field's
`is-property-owner` condition. Before, that duplicate condition was what
stopped a stale `owner-type` from keeping fields on screen after the answer
flipped back to "yes".

**#2919 is held.** The content designer asked whether an applicant with no
Planning and Development number still has to upload a site plan. Nobody has
answered. Making the number optional on lodging, as the issue says, would let
an applicant submit with neither.

## Running the smoke locally without `apps/api/.env`

The API boots from inline env:

- `DB_*`: the docker-compose defaults (`postgres`/`postgres`/`modular_forms`).
- `EZPAY_BASE_URL`: any URL. `EZPAY_DEPARTMENT_API_KEYS='{}'`, which must be
  valid JSON.
- `RECIPE_PREVIEW_TOKEN`: matching the spec's `PREVIEW_TOKEN`, because both
  forms are `preview`.
- `PREVIEW_SUBMISSION_FORM_IDS`: listing the forms. Without it, submit
  returns 400 "unpublished preview".

Uploads fail locally ("Uploads not configured"), so a walk only finishes on a
branch that doesn't upload. To cover the person owner, the "no" notices and
the submission, we ran a temporary copy of test 1 with no upload. It passed
end to end, and the copy was deleted.

## Open questions

- The #2919 site-plan rule, waiting on Environmental Health.
- On `main`, the lodging smoke's renewal test fails on unit 2: the
  `property-number-of-bunk-bed-spaces-1` follow-up shows before bunk beds are
  answered. This is not related to this change; filed as #2927.
- On `main`, the hotel smoke spec doesn't know the `applying-for` step added
  in #2813. #2922 repairs it.
