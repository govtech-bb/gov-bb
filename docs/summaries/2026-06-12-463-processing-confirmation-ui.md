# Processing confirmation UI for in-flight submission replays

## Context

Issue #463 (follow-up to #254) asked for a genuine status UI when a citizen's
submission comes back in a non-final state, instead of the interim behaviour
where `submissionState` stays `undefined` and `form-renderer.tsx` bounces the
citizen back to `check-your-answers`. Most of #463 had already landed via
`a48c0b68` (#318): `failed`/`error`/unknown and the network `catch` all commit
a `submissionSuccess: false` state → the "Something went wrong" retry panel.
The only outstanding part was the **`processing`** (and `draft`) branch, which
in `submission-outcome.ts` was a documented silent no-op (`return {}`).

Done on `worktree-463-processing-confirmation-ui` (targets `sandbox`).

## What we did

- `apps/forms/src/lib/submission-outcome.ts` — split the combined
  `processing`/`draft` case. `processing` now returns
  `{ subState: { ...base, processing: true, submissionSuccess: true,
  hasPayment: false } }` and **no** analytics event. `draft` keeps `return {}`
  with a comment that it's unreachable from the public submit flow.
- `apps/forms/src/types/props.type.ts` — added optional `processing?: boolean`
  to `SubmissionState`. Additive and back-compatible with every existing state.
- `apps/forms/src/components/submission-confirmation.tsx` — new render branch
  placed *before* the `!submissionSuccess` (failed) and `!hasPayment` (success)
  branches. Reuses the `form-page__panel--success` banner structure with
  neutral copy ("We're processing your submission" / "We've received your
  submission and it's being processed. We'll email you when it's complete.")
  and the reference number. No Try-again button, no payment block, no trailing
  next-steps/contact/feedback — it isn't a finished submission.
- Tests across all three layers: the mapper returns the processing sub-state
  (and carries `referenceCode`); the component renders the panel (reference
  shown, no Try-again, no trailing sections); and the route spec asserts a
  `processing` response **commits** state (no bounce) while firing no analytics.
  `index.tsx` itself needed no change — it already commits any returned
  `subState`.

## Why we did it that way

- **`processing` is genuinely reachable; `draft` is not.** A fresh POST only
  yields `submitted` or `pending_payment`. An idempotency-key replay of an
  in-flight submission returns `outcome: "in_progress"` → HTTP 202, but the
  controller always wraps in `ApiResponse.success(...)`, so on the wire it is
  envelope `status: "success"`, `data.status: "processing"`, with a
  `referenceCode` present. That passes `makeFetch` and reaches the mapper with a
  usable reference. A `draft` only arises from a different (non-public) path, so
  it stays a documented no-op rather than fabricating a panel for a case the
  submit flow can't produce.
- **An optional `processing?` flag, not a `displayStatus` discriminant.** The
  closed PR #473 proposed refactoring every branch to a
  `displayStatus: "success" | "processing" | "error"` discriminant. That's more
  principled but a larger refactor touching every existing branch and its tests
  for no behavioural gain here — the codebase already discriminates with
  `submissionSuccess`/`hasPayment` booleans, so a third optional boolean matches
  the existing shape. This is a one-case implementation choice, not a new
  convention (hence no ADR).
- **Silent on analytics.** A `processing` replay is a duplicate of an
  already-tracked submit, so there's no new `form-submit-success`/`error` event
  to fire. The `SubmissionEvent` union is left untouched.
- **The panel is intentionally static.** It carries no re-poll: a refresh after
  the submission has actually completed server-side still shows the processing
  copy. This is acceptable because the copy sets the expectation ("We'll email
  you when it's complete") and the real outcome is authoritative server-side —
  the stored state is display-only. The local form draft is likewise not
  cleared on this path (clearing is gated on the success event), which is benign
  for an idempotency replay since the same key would dedupe a re-submit.
- **Manual smoke is impractical.** Triggering the panel needs a live in-flight
  idempotency replay (202), which can't be reproduced locally — so coverage
  rests on the unit/component/route tests rather than a browser walk.

## Verification

- `pnpm exec nx run forms:test` — 722 passed, 1 skipped, coverage thresholds met.
- `pnpm exec tsc -b` — clean (spec files compile).
- `pnpm exec nx run-many -t build --exclude=landing,cms` — 13 projects built.
