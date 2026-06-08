# Date field part values: number→string migration, phase 1 (#815)

## Context

Date fields render day/month/year as three text inputs, but the value layer
coerced each part to a JS number on every keystroke — so `"09"` collapsed to
`"9"` under the cursor, `"00"` became `0`, and the user's literal input never
survived to submission
([#815](https://github.com/govtech-bb/gov-bb/issues/815)). The fix is to keep
parts as the digit-string the user typed.

This session implemented the change, then discovered mid-wrap that the date
value is a payload crossing the **forms-frontend ↔ API deploy boundary**, and a
single hard `number → string` flip breaks it. The work was re-scoped into an
expand-contract migration. This branch is **phase 1 (expand)**; it targets
`sandbox`.

## What we did

- **The validation boundary (`@govtech-bb/form-validation`) now tolerates both
  numeric and string date parts:**
  - `asPart` and `isCompleteDateValue` accept a finite number *or* a non-empty
    string as a present part.
  - `formatDateValue` and `parseDate`'s object branch `Number(...)`-coerce parts,
    guarding empty/NaN/zero explicitly (a string `"0"` is truthy, unlike numeric
    `0`).
- **`dateValueInputSchema` / `DateValue`** widened to `number | string`.
- **No producer changed.** The forms frontend, `review.tsx`, and the chat
  coercer still emit numbers — reverted from the string versions written
  earlier this session.
- Specs across `form-types`, `form-validation`, and the API email builder now
  assert **both** shapes validate/format identically.

## Why we did it that way

- **A code-review subagent caught an unmigrated consumer** (`apps/chat` built
  numeric parts inline), which first flagged how widely the shape travelled.
- **The preview smoke then caught the real blocker.** PR #945's first smoke
  failure was a transient 429 (rate limit); the re-run surfaced a **422** —
  `POST /submissions failed`. The per-PR preview frontend runs against the
  *shared sandbox API* (`pr-preview.yml`; there is no per-PR API), so a
  string-emitting frontend hit the still-numeric sandbox validation and every
  date part read as absent → "incomplete date" → 422.
- **This is the ADR 0040 hazard** (a wire field flipped to an incompatible shape
  across a deploy boundary). The catch-22: no code on the branch can make the
  preview smoke green, because the shared API won't accept strings until *after*
  this merges and redeploys.
- **Resolution: expand-contract (ADR 0043).** Phase 1 makes the API tolerant of
  both shapes and keeps the frontend numeric — so the preview smoke passes
  (numeric→numeric) and, once deployed, the sandbox API accepts string parts.
  Phase 2 (a follow-up branch, opened after sandbox runs the tolerant API)
  flips the frontend to strings; its smoke then passes (strings→tolerant-API).
  The leading-zero UX fix and the proposed `< 1900` year-floor change both ride
  phase 2 — phase 1 is a pure, no-user-visible-change tolerance step.

## Verification

- `nx run-many -t build --exclude=landing,cms` — green (13 projects).
- `tsc -b` clean.
- `nx run-many -t test -p form-types,form-validation,forms,api` — green
  (both numeric and string date fixtures covered).

## Follow-up

- **Phase 2 (#815 cont.):** flip the forms frontend to string parts after this
  deploys to sandbox. Includes `parseDatePart` → string, `DateValue` string
  internally, `review.tsx`/chat producers, the leading-zero behaviour, and the
  `< 1900` year check. Its preview smoke will pass against the now-tolerant API.
