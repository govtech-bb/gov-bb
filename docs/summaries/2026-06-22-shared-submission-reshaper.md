# Shared submission-payload reshaper — single-sourcing the wire shape

/ 2026-06-22 · `packages/form-types`, `apps/forms`, `apps/chat`, `apps/api`

## What this was

Two consolidation issues from the `apps/` dedup audit:

- **#1399 (DUP-06)** — `apps/forms` hand-redeclares producer-side wire types
  owned by `apps/api`.
- **#1398 (DUP-05)** — the browser form (`formatDataForSubmission`) and the chat
  assistant (`reshapeByStep`) independently build the `POST /submissions`
  payload, and chat does *no* empty-value filtering and *no* repeatable handling
  — so the two channels can submit subtly different shapes for the same form.

#1398's plan declared a dependency on #1399 ("needs the shared `SubmissionValues`
type"). Both were tackled this session, narrowed.

## Key decisions (and why)

- **Did #1399 first, narrowed to just `SubmissionValues`.** #1399 has two halves:
  the values type and the `ApiResponseShape<T>` envelope. Only the values type
  blocks #1398, and the envelope half is independent with a much larger blast
  radius (every forms response type). So this session shipped only the
  `SubmissionValues` promotion; the envelope consolidation is handed off to the
  responsible agent via `docs/plans/1399-dup-submission-response-wire-types.md`
  (Half 1 marked done, Half 2 laid out with file pointers). #1399 keeps its
  `progressing` label because Half 2 remains.

- **Shared only the keying + filtering *core*, not a full reshaper.** The two
  call sites take fundamentally different inputs — forms has flat
  `stepId_fieldId` keys plus rich browser-form repeatable state and DOM-derived
  hidden fields; chat has bare `fieldId` keys, the contract for step lookup, and
  one value per field. The genuinely common part is "bucket resolved
  `(stepId, fieldId, value)` triples into `SubmissionValues`, dropping empties
  but keeping `false`." That became `assembleStepKeyedValues` +
  `isSubmittableValue` in `form-types`. A full `reshapeSubmissionValues` with an
  options seam (the plan's first instinct) was rejected: most of it would have
  been forms-only input with chat passing empty sets.

- **Repeatable collapsing stays in `apps/forms`.** It is driven entirely by
  `RepeatableStepSettings` (browser form state). More fundamentally, **chat
  cannot represent repeatable instances today** — it collects
  `Record<fieldId, string>`, one value per field — so porting the collapse into
  a shared helper chat calls would be dead code. The 422 risk the issue
  describes is partly structural, not just missing code. (Recorded as a
  consequence in ADR 0054.)

- **`valueIsEmpty`/`isDateComplete` moved into `form-types`.** The filter needs
  an emptiness primitive; that primitive lived in forms and its own comment
  already called the semantics "shared with the validation boundary." Moving it
  (re-exported from forms' `validation-methods` for existing consumers) lets the
  filter be genuinely shared rather than reimplemented. This tripped form-types'
  98% branch-coverage gate until a local `value-empty.spec.ts` was added — the
  forms spec that exercised it doesn't count toward form-types' own coverage.

- **Chat now filters empties too.** Routing chat through the shared helper means
  it drops empty optionals like the browser form — the alignment the issue
  wanted. Verified safe: `apps/api` skips `undefined` steps on expand and
  required-field enforcement runs *before* reshaping, so a dropped empty step
  can't cause a false 422.

## Verification

`nx run-many -t build` (13 projects) clean; `tsc -b` clean; `form-types`,
`forms`, `chat`, `api` test suites all green together (form-types back to 100%
coverage). New tests were written failing-first (TDD): a parity test asserting
forms-style and chat-style entry resolution produce identical output, and a chat
test proving the empty-optional drop. A code-review pass over the diff returned
zero findings and confirmed forms' output is byte-identical to before.
