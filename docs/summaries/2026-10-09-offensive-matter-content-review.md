# Offensive matter licence: Environmental Health content review

2026-10-09 · Forms, landing · #2857

## Context

Environmental Health's content review (28 Sep 2026) revised the start page and
the form for "Apply to Environmental Health for an offensive matter licence to
move sewage and other harmful waste". The applicant and the licence holder are
now collected once, and new or renewal moves into each vehicle. The issue is
labelled BLOCKED on four MDA questions (Q1–Q4); this change ships everything
that doesn't depend on the answers.

## What we did

- Start page rewritten to the review: new title and description, definition of
  offensive matter, the 10pm–6am rule, "Who needs to apply", "What you need",
  "How to apply" with bold route titles (as in #2814), "Get help" with each
  office as a bold name and the phone and email on separate lines.
- Recipe: new `applying-for` first step with a `has-permission` gate
  (`pattern: ^yes$`, as on the hotel and swimming pool forms); "Your details"
  reordered with a "Your address" sub-heading; `person-details` and
  `business-details` steps shown only for their answer; new/renewal and the
  current licence number moved into each vehicle; "Your agreement" with full
  name and date; the confirmation rewritten and the duplicate `nextSteps`
  removed.
- `application-type` and `business-address-details` steps are gone. The CMS
  webhook (`groupByStep`) now receives `applying-for`, `person-details`,
  `business-details` and `operator-address` groups, and new/renewal plus the
  licence number arrive inside each `vehicle-details` instance.
- Smoke spec rewritten: one test per `applying-for` answer, the permission
  refusal, a per-vehicle renewal next to a new vehicle, and a two-vehicle
  submission.

## Why we did it that way

**Routing uses one address that everyone answers.** `catchmentRouting` reads a
single coordinate and parish field, and the API invariants require that parish
to be shown to everyone and required. The review's per-branch "Is the address
the same as yours?" questions would scatter the licence holder's address
across three steps, two of them conditional. The paper route sends the form to
"the office for the area where the business or operator is located", so we
added one unconditional `operator-address` step ("Where is the business or
operator located?"), with the address lookup and hidden coordinates. The
person and business steps don't ask for an address. A fallback chain in
`catchmentRouting` would match the review exactly, but it is a platform change
to fix one form. The cost is that someone applying for themselves enters an
address twice: "Your address" and the operator address.

**Multi-vehicle stays.** The repeatable vehicle step (max 20) was already live.
Capping it while Q1 is open would remove a working feature. The "more than one
vehicle" copy ships with it, and the PR flags that it depends on Q1.

**The current licence number is optional and per vehicle.** The condition
leaves out `targetStepId`, so it applies within each vehicle instance.

**Telephone keeps the registry hint.** The review asks for "Enter a Barbados
or international number." The registry hint from #2917 says the same thing
with example numbers, and it is the house pattern, so we kept it.

**Office names kept as "Randal Phillips" and "Sir Winston Scott"**, and St.
Philip stays on 536-4240 (#2817). These names match `POLYCLINIC_CONTACTS` and
the routing tables.

## Open questions and platform limits

- MDA Q1–Q4 are unanswered. If Q4 is "yes", add "covered" to the inspection
  lists on the start page and the vehicle step.
- The submit button reads "Submit", hard-coded in `form-renderer.tsx`. A recipe
  can't set "Submit application".
- The confirmation can't show the applicant's email address (no token), so it
  says "the email address you gave".
- Check your answers groups by step with one Change link per section. A vehicle
  can only be removed by answering "No" to "add another" on an earlier vehicle,
  which removes every vehicle after it (their answers are purged, #432). There
  is no way to remove one vehicle from the middle.
- The form builder may hold stale state for this form. Refresh it before any
  republish, or it will strip the routing wiring (#2409).
