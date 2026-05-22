# Analytics events use fixed names and structured data

**Status:** Accepted (2026-05-21)
**Applies to:** `apps/forms`, and any future app adding analytics. `apps/landing` is explicitly exempt — see Consequences.

## Context

Two apps in this monorepo emit analytics to Umami Cloud: `apps/landing` (the public services directory) and `apps/forms` (the transactional forms SPA). When wiring analytics for `apps/forms`, we faced two design questions whose answers we want to bind future work to.

**1. Naming.** `apps/landing` uses per-item event names (`service-renew-passport`, `org-ministry-of-finance`) so each service/organisation shows up as its own metric in Umami's dashboard. That works because the directory is small, curated, and bounded.

`apps/forms` does not have those properties. The space is form × step × field × reason, growing every time a form is added or a step splits. Encoding any of those dimensions into event names would produce an unbounded metric list that nobody can navigate.

**2. Privacy.** `apps/forms` handles PII. Field values are obviously off-limits, but field *labels* also drift with copy edits and can leak intent ("national ID number"); free-text fields and filenames can themselves contain user content.

## Decision

**Naming convention.**

For funnel and transactional surfaces (`apps/forms`, and any future workflow / dashboard app), analytics event names come from a small fixed enum. High-cardinality dimensions — `form_id`, `step_id`, `field_id`, `reason`, etc. — live in event *data*, never embedded in the event name.

Concretely, `apps/forms` ships `form-open`, `form-step-view`, `form-step-advance`, `form-step-back`, `form-field-error`, `form-submit`, `form-submit-success`, `form-submit-error`, `form-file-select` — and that set grows only when a new *kind* of event is needed, not when a new form or field is added.

**Privacy bar.**

Analytics never captures:

- Field values.
- Field labels.
- Free-text user input (feedback comments, search-box text in PII-bearing contexts).
- Filenames.

Always-OK identifiers and metadata:

- Field IDs (stable, code-defined — `field.fieldId`, not `field.id` which can be step-namespaced and contain user-visible structure).
- Step IDs, form IDs.
- MIME types, file sizes in KB.
- Validation reason categories (`required`, `format`, `validation`, `server`, `network`).

If a future form ever uses a `field_id` that carries user-supplied content (e.g. dynamically generated repeatable-step IDs), the decision to send it as analytics data must be revisited.

## Consequences

- `apps/landing` keeps its high-cardinality naming pattern. It pre-dates this decision, its surfaces are bounded directories, and rewriting it would be churn for no analytical benefit. New events added to `apps/landing` may follow either pattern, judged case-by-case on whether the dimension is bounded.
- Any *new* app adding analytics — `apps/chat`, the `apps/form_builder` admin surface, future workflow apps — must use fixed names + structured data. If a surface looks bounded like `apps/landing`'s, raise it in review before diverging.
- Search-query text remains a special case: `apps/landing` captures it (intended for service-name searches, no PII). `apps/forms` does not have a free-text search surface; if one is added, it must not capture query text by default — re-evaluate against this decision.
- The privacy bar above is the floor. Apps may be stricter (e.g. drop file size buckets) but cannot be looser without a new decision.
