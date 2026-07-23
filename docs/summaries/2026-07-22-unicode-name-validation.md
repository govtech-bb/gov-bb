# Session summary — Unicode-aware person-name validation (#1843)

**Date:** 2026-07-22 · **Branch:** `unicode-name-validation-1843-fix` (off `main`)

## What shipped

Person-name fields stopped rejecting legitimate names. The four name components
(`first-name`, `last-name`, `name`, `middle-name`) now share one Unicode-aware
pattern instead of four copies of a Latin-1-only regex.

- **New shared constant** `packages/registry/src/person-name-pattern.ts`:
  `PERSON_NAME_PATTERN` = `^\s*\p{L}(?:[\p{L}\p{M}\s'’.-]*[\p{L}\p{M}.])?\s*$`
  plus `PERSON_NAME_ALLOWED` (the error-message wording). Re-exported from the
  registry barrel.
- The four components import it and drop their inline regex; their pattern error
  messages now mention periods.
- **`patternRunner`** (`packages/form-validation/src/rules/string.ts`) now
  compiles patterns with the `u` flag — required for `\p{L}`/`\p{M}`.
- Tests: `person-name-pattern.spec.ts` (accepts `St. John`, `J. R.`, `O’Brien`,
  `Nguyễn`, `Владимир`, `李`, NFD `Lê`/`José`; rejects blank/`123`/`Smith-`/
  leading separators) and a `patternRunner` `u`-flag case.

## Why it looks the way it does

- **`\p{L}` over expanded explicit ranges.** Only a Unicode letter property can
  cover Latin-extended + Cyrillic + Arabic + CJK at once; explicit ranges can't.
  This forced the `u` flag on `patternRunner`.

- **The `u` flag was flipped globally, not per-rule.** Audited every builtin
  (5) and committed-recipe (2) pattern — all compile under `u` with unchanged
  matching. A per-rule opt-in was rejected as unnecessary machinery. The residual
  risk (a DB custom-component or future recipe pattern that is *not* `u`-compatible
  fails closed) is documented in the runner comment — this is the one forward
  constraint: **new pattern-rule regexes must be `u`-compatible.**

- **Allowed a trailing period** so initials like `J. R.` pass (lead's request).
  Side effect: `John.` also passes — accepted, since over-strict validation is
  the bug being fixed. A dangling `Smith-` / trailing space is still rejected
  (the pattern must end on a letter, mark, or period).

- **Trailing `\p{M}` (added in review).** The first cut ended on `[\p{L}.]`,
  which rejected NFD (decomposed) names ending in an accented letter — e.g.
  Vietnamese `Lê` as `L,e,◌̂`, where the final code point is a combining mark.
  iOS/macOS emit NFD, so this was a real gap in exactly the names #1843 targets.
  Fixed to `[\p{L}\p{M}.]`; NFD test cases added.

- **`minLength: 2` left unchanged (deliberate).** Consequence: a single-character
  name like `李` passes the *pattern* but is still rejected by the length rule.
  A known, accepted limitation — flagged on the PR, not a regression.

## Verification

- `registry:test` (60) and `form-validation:test` (282) pass; `form-builder`
  (178) and `forms` (777) unaffected.
- `nx run-many -t build --exclude=landing` — all projects compile; lint clean.
- No test/snapshot referenced the old message or old pattern.
