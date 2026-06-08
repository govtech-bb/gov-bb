# Date field part values as text — phase 2 (frontend flip) (#815)

## Context

[#815](https://github.com/govtech-bb/gov-bb/issues/815) is being migrated
expand-contract (ADR 0043) because the date value crosses the forms-frontend ↔
API deploy boundary. **Phase 1** (PR #945, merged + deployed to sandbox) made
the `@govtech-bb/form-validation` boundary tolerate both numeric and string
date parts. **This is phase 2 (migrate):** the frontend flips to emitting
strings, delivering the actual user-facing fix. Targets `sandbox`, branched
after phase 1 was live on sandbox.

## What we did

- **`parseDatePart`** now returns the digit-**string** verbatim (or `undefined`
  when empty), so `"09"` stays `"09"` under the cursor and `"00"` stays distinct
  from `"0"`.
- **`isDateComplete`** treats `""` as absent (agreeing with the boundary's
  `isCompleteDateValue`).
- **`review.tsx`** `formatDate` takes `DateValue` and `Number(...)`-coerces parts
  (so a string `"09"` formats correctly).
- **`apps/chat`** date coercer emits string parts.
- **Year check** tightened from `< 1000` to `< 1900` — the deferred behaviour
  change: a too-early/short year ("90", "1899") trips "Year must include 4
  numbers". Proper lower-bound messaging stays the configurable `minYear` rule's
  job.
- Specs across forms + form-validation flipped to string fixtures with
  leading-zero and `< 1900` coverage.

## Why we did it that way

- **Types stay union (`string | number`), not narrowed to string.** The API must
  keep accepting numeric parts from old/cached frontends during and after this
  deploy — narrowing the validation boundary back to string-only is a separate,
  later "contract" step (ADR 0043), not safe yet. Phase 2 only changes what the
  frontend *produces*; the producer emits a string, which is a subset of the
  tolerated union.
- **Safe in any deploy order.** New frontend (strings) → tolerant API ✓; old
  cached frontend (numbers) → tolerant API ✓. The preview smoke
  (new-frontend → sandbox API, now phase-1-tolerant) passes.
- **`< 1900` rode phase 2, not phase 1.** It's a validation-behaviour change
  coupled to the feature, so it was kept out of the pure-tolerance phase-1 step.

## Verification

- `nx run-many -t build --exclude=landing,cms` — green (13 projects incl. chat).
- `tsc -b` clean.
- `nx run-many -t test -p form-types,form-validation,forms,api` — green.
- Manual real-browser smoke (leading zero under the cursor) left to Isaiah per
  the house rule.

## Follow-up

- **Optional phase 3 (contract):** once no number-producing frontend remains
  deployed, narrow `dateValueInputSchema` / `DateValue` and the validation
  helpers back to string-only and drop the numeric branches.
