# Repeatable instance titles — distinguish repeated steps (#801)

## Context

Every instance of a repeatable step showed the identical title on the live
form and the review page (#801). The agreed design: optional `instanceLabel`
on the repeatable behaviour (caption "Dependent 2" above the title) with an
auto-numbered title suffix ("Title — 2") as the fallback for all existing
recipes; instance 1 is never marked.

## What we did

- `instanceLabel` on `repeatableBehaviourSchema` + form-builder text param,
  mirroring the `addAnotherLabel` precedent (d185a52a).
- `getInstanceMarker(step)` in `repeatable-helper.ts` as the single home for
  marker logic (63ec7046, ADR 0039).
- Renderer caption / title suffix and review heading suffix (bf71b29c), with
  the caption moved inside the `<h1>` after review (86c2c7ec, ADR 0038).
- Verified end-to-end in the running app across all three layouts; filed
  #811 for unrelated e2e-suite rot found along the way.

## Why we did it that way

- **Markers key off the `~N` stepId suffix, not new state.** Clones carry
  behaviours via `...step` spread, so the marker needs nothing persisted —
  the suffix plus the step's own behaviours fully determine it.
- **The plan's `~N` → N+1 assumption was wrong for sharedFields recipes.**
  In that layout the base step is a separate shared-values page and `~1` *is*
  instance 1. Orientation against `setupRepeatSteps` caught this before any
  rendering code was written; the helper is layout-aware (see ADR 0039 — the
  trap, and why all surfaces must go through `getInstanceMarker`).
- **Label case = caption, fallback = title suffix.** A suffix on a
  plural-phrased title ("Tell us about your dependent(s) — 2") reads
  acceptably as a fallback, but a configured noun reads better as a GOV.UK
  eyebrow; replacing titles outright was rejected in planning because titles
  carry instruction text. The review page uses the suffix form in both cases
  because summary headings are scannable lists, not page titles.
- **Component tests mocked the helper, so only live verification could catch
  integration gaps** — and the first live run produced a false FAIL: the
  user's own dev server (stale code) owned port 3000, the worktree vite
  silently fell back to 3001, and Playwright's hardcoded `baseURL` tested the
  wrong server. Evidence (curling the served transformed module) beat
  guesswork; nothing was wrong with the change.

## What we almost got wrong

- Shipping the caption as a sibling above the `<h1>`: visually fine,
  identical accessible names for every instance. Caught in review; fixed per
  ADR 0038.
- Debugging the false e2e FAIL as if it were a marker bug — the systematic
  route (read the served bundle, check who owns the port) resolved it in two
  steps.

## Open questions

- The forms e2e helper suite is broken against current field markup and
  API-less runs can't pass step 4 (file presign) — tracked in #811, including
  pointers to the working overrides/mocks from this session.
