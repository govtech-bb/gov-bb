# 0054 — The submission payload shape, and the logic that assembles it, live once in `@govtech-bb/form-types`

## Context

Two apps independently turned collected field values into the step-keyed shape
`apps/api` accepts at `POST /submissions`
(`SubmissionValues = Record<stepId, Record<fieldId, value> | Array<…>>`):

- `apps/forms` `formatDataForSubmission` — strips hidden fields, filters empty
  values (with a "`false` is a real answer" carve-out), collapses repeatable
  steps into arrays, then buckets `stepId_fieldId` keys under their step.
- `apps/chat` `reshapeByStep` — buckets each `fieldId` under its step (resolved
  via the contract) and coerced its value, **with no empty-value filtering and
  no repeatable handling at all**.

Both fed the same endpoint but shared no code, and the producer-side type was
hand-redeclared in `apps/forms` as `FormValuesByStep`. So the two channels could
build subtly different payloads for the same form — chat shipped empty optionals
the browser dropped — and nothing but a live smoke run would catch it. The type
system did not (#1398 / #1399).

## Decision

The `POST /submissions` value shape **and** the keying + empty-filtering logic
that builds it are single-sourced in `@govtech-bb/form-types`:

- `SubmissionValues` is defined there; `apps/api` and `apps/forms` import it
  (forms keeps the local name `FormValuesByStep` as an alias). No app
  re-declares the wire shape.
- `assembleStepKeyedValues(entries)` is the one implementation of "bucket
  resolved `(stepId, fieldId, value)` triples into `SubmissionValues`, dropping
  empty values but keeping an explicit `false`". `isSubmittableValue` /
  `valueIsEmpty` (the emptiness primitive) live there too.

**Any submission channel — the browser form, the chat assistant, any future
one — must assemble its payload through `assembleStepKeyedValues` rather than
re-implementing step-keying or empty-value handling.** A channel only owns the
channel-specific step that turns its input into `(stepId, fieldId, value)`
entries (forms splits `stepId_fieldId` keys after hidden-stripping; chat resolves
fields via the contract and coerces). The keying + filtering policy is not theirs
to reinvent.

## Consequences

- `formatDataForSubmission` keeps its **forms-specific** hidden-field stripping
  and repeatable-step / sharedFields collapsing — these depend on browser form
  state (`RepeatableStepSettings`, DOM-derived hidden fields) that no other
  channel has — and delegates only the final keying to the shared helper.
- Repeatable-step collapsing is deliberately **not** in the shared helper: chat
  collects one value per field (`Record<fieldId, string>`) and has no input that
  can represent repeated instances. If chat ever needs repeatables, that input
  model must change first; the helper is not the place to paper over it.
- Adopting the shared filter aligned chat with the browser: chat now drops empty
  optionals (an all-empty step becomes absent from the payload). This is safe —
  `apps/api` skips `undefined` steps on expand and required-field enforcement
  runs before reshaping, so a dropped empty step cannot cause a false 422.
- A reviewer seeing a new channel (or new code) build `{ stepId: { fieldId } }`
  by hand should treat it as a regression and route it through
  `assembleStepKeyedValues`.
- `SubmissionValues` is the contract surface: an `apps/api` change to the shape
  is now a compile error in every consumer, not a runtime/smoke surprise.
