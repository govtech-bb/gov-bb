# 0069 — A repeating pair of values is one field, not two field arrays

**Date:** 2026-08-20
**Status:** Accepted

## Context

`fieldArray` (ADR 0067) repeats **one** field: the answer becomes a string array
and the renderer draws an "Add another" link that pushes an empty entry onto it
(`renderRepeatableOrSingle`). Two fields each carrying their own `fieldArray`
therefore get two independent arrays and two independent counters. Nothing in
the platform relates them — not the renderer, not validation, not the review
screen, which joins each array separately.

The restaurant licence form (#2345) hit this first. Opening hours needed "this
day is open 11:00–15:00 and 18:00–22:00", so the first cut authored, per day, a
`components/generic-time` opening time and closing time, each with a
`fieldArray`. An applicant could add a second opening time and no matching
closing time, and the form would accept it: `["11:00", "18:00"]` against
`["15:00"]`, rendered on check-your-answers as two unrelated rows with nothing
saying which close belongs to which open. The pairing existed only in the
author's head and in the field labels.

Designer review rejected that shape on exactly that ground. The replacement is
one text field per day holding `HH:MM - HH:MM`, with a `pattern` rule — which
`forEachString` applies to **every** entry of the array — so each repeated set
of hours is format-checked and the two halves of a range cannot be separated.

## Decision

**When two values only make sense as a pair and the pair repeats, capture the
pair in ONE field constrained by a format `pattern` — never as two fields each
carrying its own `fieldArray`.**

This covers any repeating range: opening and closing times, a from/to date, a
start/end year, a low/high quantity.

Corollaries:

- **Two `fieldArray` fields whose entries are positionally related are a
  defect**, not a style choice. If entry _n_ of field A is meant to correspond
  to entry _n_ of field B, the platform is not expressing that and will not
  enforce it.
- **When the pair genuinely must stay structured** — separate values for a
  downstream consumer, a real time picker per half — use a `repeatable` **step**
  instead. A step instance keeps its fields together, which is precisely the
  guarantee two field arrays lack. The choice is between one field with a format,
  or a group that repeats as a unit; there is no third option that repeats two
  fields in lockstep.
- **State the shape in a `hint`, enforce it with a `pattern`, and be tolerant of
  near-misses of the same answer.** The restaurant hours accept a missing
  leading zero and a hyphen, en dash or em dash — `9:00-17:00` and a Mac's
  smart-punctuation `11:00 — 15:00` are the same answer typed by different
  habits. They reject `9am to 5pm` and `24:00 - 25:00`, which are not.

## Consequences

- **The combined field is a string, and downstream consumers must parse it.**
  Webhook payloads and case-management exports receive `"09:00 - 17:00"`, not two
  fields. That is the accepted cost of the invariant; a consumer that needs the
  halves separately is the trigger to revisit and move to a repeatable step.
- `fieldArray` + `pattern` is now a sanctioned combination and should stay
  working: string-format rules validate per entry and skip blanks. `required`
  remains weak on an array (a row typed into and then cleared reads as a
  non-empty array), so a format rule is the real guard, not `required`.
- The AI authoring route can still emit two paired field arrays — the guardrails
  in `apps/form_builder_api/src/ai/system-prompt.ts` document `fieldArray` (ADR 0067) but not this rule. Teaching the prompt is follow-up work; until then
  this ADR governs hand-authored recipes and review.
- This is about **repeating** pairs. A single, non-repeating range stays two
  fields — that is what the cross-field `min`/`max` `referenceFieldId`
  validations are for, and they keep the two halves consistent without a
  combined string.
