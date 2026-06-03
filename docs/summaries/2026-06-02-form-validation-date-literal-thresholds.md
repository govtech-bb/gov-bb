# Date literal thresholds in shared form-validation (#633)

Date: 2026-06-02
Issue: [#633](https://github.com/govtech-bb/gov-bb/issues/633)
Branch: `worktree-fix-633-date-literal-thresholds` → `sandbox`

## Why this work happened

The #433 audit (consolidating `apps/forms` onto `@govtech-bb/form-validation`)
flagged three residual divergences between the old client validators and the
shared runners. #633 resolves them: one behavioural fix, two confirmed as
intentional.

## What changed

### 1. `parseDate` accepts `DD/MM/YYYY` literals (behavioural)

The shared `parseDate` (`packages/form-validation/src/rules/date.ts`) parsed
literal date-comparison thresholds (`after`/`before`/`onOrAfter`/`onOrBefore`'s
`config.value`) with `new Date(str)` — i.e. ISO or US `MM/DD`. A Barbados author
typing `31/12/2020` got `Invalid Date` → the rule fired incorrectly; `01/02/2020`
was silently read as 1 Feb via US `MM/DD` order.

The fix forks on the separator rather than replacing the parser:

- A `/`-separated string is treated as the author-typed `DD/MM/YYYY` (day-first),
  matching the old client and the locale.
- Anything else falls through to native `new Date(str)`, preserving ISO parsing
  for the `apps/api` submission path.

**Why a fork, not a replacement:** `parseDate` is shared with `apps/api`, where
submitted/stored date values arrive as ISO strings or `DateValue` objects — never
`/`-separated. ISO uses `-`, the literal uses `/`, so the two never collide. This
was verified against `submission-pipeline.service.ts` before committing.

The parser is stricter than the legacy one it replaces: each segment must be a
plain digit run (`/^\d+$/`, year exactly 4 digits) and the constructed `Date`
must round-trip. This was added after code review found the naive version
silently accepted garbage — `Date.UTC` rolls over out-of-range components
(`31/02/2020` → 2 Mar) and `Number()` coerces `0x10`/`12.5`/`" 5 "`. Rather than
inherit the legacy foot-gun into the *shared* package, malformed thresholds now
return `null` so the rule fires (treats the threshold as unusable) instead of
comparing against a plausible-but-wrong boundary.

### 2. `DD/MM/YYYY` format hint in the builder

The threshold Value input was a bare `type="text"` with no guidance. An optional
`valuePlaceholder` was added to `ValidationRuleDescriptor`
(`packages/form-builder/src/behaviors/validation-builder.ts`) and set to
`"DD/MM/YYYY"` on the four date comparison rules — deliberately **not** on
`minYear`/`maxYear`, which take a plain numeric year. Scoping the hint via the
descriptor keeps rule-specific knowledge with the rule definitions and naturally
excludes the year rules. The editor wires it onto the input's `placeholder`.

## Decisions recorded (no code change)

These two divergences were confirmed **intentional** and kept as-is, so they are
not re-flagged in future audits:

- **#2 — `Number` vs `parseFloat` for `min`/`max` coercion.** Shared `Number` is
  stricter (`"12px"` → `NaN` → fails; old `parseFloat` read `12`). Unreachable
  through the real `type="number"` input. The `Number("") === 0` quirk is masked
  by required-first / empty-skip ordering.
- **#3 — `equal`/`notEqual` on `0`/`""`.** The old truthiness guard silently
  stopped enforcing any comparison whose operand was `0`/`""` — a real
  enforcement gap. Shared compares directly (`0 === 0`), which is correct.

## Notable choices

- **Cut from `sandbox`, not the #634 branch.** The plan said to base this on
  `worktree-forms-adopt-shared-form-validation` "since it edits the same shared
  package," but verification showed **zero file overlap** with #634 (it touches
  `file`/`number`/`string.ts` and the `apps/forms` copy of `validation-builder`,
  none of this plan's four files). So this is decoupled and merges cleanly.
- **`"2020"` parses as ISO, not the DD/MM fork.** The plan listed a bare year
  among malformed inputs expected to be `null`, but it has no `/`, so it stays on
  the ISO path (`new Date("2020")` → 1 Jan 2020). Tightening the shared ISO
  branch to reject it would risk the `apps/api` path the fork is designed to
  protect, so it was left as valid ISO and documented in a test.

## Follow-up

- [#636](https://github.com/govtech-bb/gov-bb/issues/636) — dedupe the day-first
  date-parse logic (shared `parseDate` vs legacy `parseDateString`) into one util.

## Verification

- `date.spec.ts`: 62/62 (TDD red→green; added day-first, US-MM/DD guard, ISO
  regression, rollover, `Number`-coercion, short-year, and bare-year cases).
- Builds: `form-validation`, `form-builder`, `form-builder-app`, `forms`, `api`.
- Tests: `form-validation`, `form-builder`, `forms`, and `api`'s
  `submission-pipeline.service.spec` (the path that calls `parseDate`).
- Lint clean on all changed files (pre-existing unrelated lint errors in
  `form-builder-app` auth/options routes left untouched).
