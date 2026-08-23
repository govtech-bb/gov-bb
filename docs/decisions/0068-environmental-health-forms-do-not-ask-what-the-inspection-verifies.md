# 0068 — Environmental Health forms do not ask what the inspection verifies

**Date:** 2026-08-20
**Status:** Accepted

## Context

The Environmental Health licence forms (food business, restaurant, temporary
restaurant, officer request) were first built by converting the paper forms
question-for-question. The paper forms are the inspector's own worksheet, so
that conversion pulled the whole inspection checklist onto the applicant:
how food is cooled and reheated, whether hot food is held in a warmer, where
the bins are kept and how often they are emptied, whether there is a set area
for washing dishes, where the water comes from.

Every one of those is established on site during the pre-licence inspection.
Asking them on the form has three costs:

- **Length.** The food business form ran to twelve steps, most of them
  inspection detail, for a licence whose decision does not turn on the answers.
- **Contradiction on record.** An applicant's good-faith guess about their own
  future kitchen becomes a stored answer that the inspection then contradicts.
  Neither the form nor the case file says which one governs.
- **False precision.** "How will the food be cooled and stored?" invites a
  sentence the department cannot act on and will verify anyway.

Designer review of the food business licence form (2026-08-20) struck these
questions on exactly one repeated ground — *"handled at inspection"* — and open
issue #2345 applies the same reasoning to the restaurant licence form. The rule
was being rediscovered per form rather than stated once.

## Decision

**An Environmental Health form asks only what the department cannot establish
on site.** Where a question's answer is verified by an inspector during the
pre-licence inspection, the form does not ask it: the inspection is the source
of truth, and asking anyway puts a contradictable answer on record.

What stays on the form is what the inspection cannot supply:

- **Identity and contact** — who is applying, who to reach, where to send post.
- **Routing and scheduling** — the address that decides the catchment, the
  premises type, a vehicle registration for a mobile unit: facts an officer
  needs *before* travelling.
- **Facts that set a requirement rather than describe a practice** — e.g. staff
  numbers by sex, which fix the restroom provision the premises must meet.
- **Third parties the department cannot see from the premises** — off-site
  suppliers and the addresses where food is prepared elsewhere.
- **Documents** — a floor plan, or the Town and Country Planning application
  number that stands in for one.

The corollary: where a removed question protected the applicant against a
liability, replace it with a stated responsibility rather than dropping it
silently. This pass removed the enumeration of food types and sources and put a
`content` warning in its place — *"It is your responsibility to make sure your
suppliers have a valid food licence."* The obligation survives; the interrogation
does not.

## Consequences

- New or reviewed Environmental Health forms are triaged against this rule
  before component selection. "The paper form asks it" is not a reason to keep
  a question.
- **The department loses pre-inspection triage.** Officers can no longer read a
  submission and predict what they will find, so an inspection cannot be
  prioritised or specialised from the form. That is the accepted cost, and it is
  the department's call to revisit — not a defect to be fixed by re-adding
  questions.
- Removing a question removes its fieldId from the submission payload and from
  any webhook mapping keyed on it. Check `excludeSteps` and the case-management
  payload when a step is deleted (see #2343 for the class of problem).
- This ADR governs question *scope*, not component choice. The guardrails in
  `apps/form_builder_api/src/ai/system-prompt.ts` still decide how a retained
  question is built.
- The rule is specific to services with a statutory on-site inspection. It does
  not generalise to forms whose decision is made purely on the submission.

## Note — the food business licence no longer offers the planning-number stand-in

A later designer pass on `apply-for-food-business-licence` (PR #2377) removed the
"I do not have a floor plan" toggle and the `planning-application-number` field
that stood in for the upload. The floor-plan step is now a single required
upload.

That narrows the "Documents" bullet above for this one form: the plan itself
stays, but the Town and Country Planning application number is no longer an
accepted substitute, so an applicant whose plans are still with Planning cannot
submit until they have a copy. The stand-in remains available on the restaurant
licence form, where the same pass added it as
`building-plan-number` / `tracking-number-instead`.

This is recorded rather than reversed: it is the department's call whether the
food business form should regain the substitute.
