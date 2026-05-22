# forms test review — strengthen weak assertions, pin real source bugs as red

## Context

`apps/forms` ended the previous session with strong line coverage
(~96%) but the spec suite had grown opportunistically — many tests
asserted `toHaveBeenCalled()` without args, `toBeDefined()` on
literals, or otherwise drifted into tautology. A `/code-review` pass
on the test files (xhigh effort, five finder angles, parallel
sub-agents per suite) produced 15 ranked findings; this session
addressed all 15.

## What we did

### 14 spec files strengthened

- `lib/api/forms.spec.ts` — 6 changes
- `lib/form-builder/validation-methods.spec.ts` — 2
- `lib/form-builder/validation-builder.spec.ts` — 1
- `lib/form-builder/helpers/repeatable-helper.spec.ts` — 3
- `lib/form-builder/index.spec.ts` — 1
- `lib/design-system/index.spec.ts` — 1
- `lib/security/safe-payment-url.spec.ts` — 1 (documented gap via `describe.skip`)
- `components/form-renderer.spec.tsx` — 3
- `components/applicant-name-display.spec.tsx` — 2
- `components/field-renderer.spec.tsx` — 2
- `components/review.spec.tsx` — 1
- `routes/__root.spec.tsx` — 1
- `routes/index.spec.tsx` — 1
- `routes/forms/$formId/index.spec.tsx` — 4
- `hooks/use-step-guard.spec.ts` — 2

Patterns of change:

- **`toHaveBeenCalled()` → `toHaveBeenCalledWith(<expected args>)`** —
  most weak assertions were on `handleChange`, `navigate`,
  `formatDataForSubmission`, etc., where the action firing was less
  interesting than the value it fired with.
- **Tautological identity checks replaced with structural ones** —
  e.g. the design-system barrel test no longer asserts `toBeDefined()`
  on a Proxy whose `.default` accessor returns the string `"default"`.
- **`jest.clearAllMocks()` → `jest.resetAllMocks()`** in the
  form-renderer spec, because the existing reset hook was leaving
  `mockReturnValue` implementations intact between tests, creating an
  order-dependent suite.
- **Time-bomb dates replaced with dynamic ones** — the
  validation-builder spec's `year: 2027` would have started failing
  after 2027-06-15; now `future.setFullYear(future.getFullYear() + 1)`.
- **`if (!onSubmit) return;` silent skip replaced with `throw`** in
  the route spec. The previous pattern would have silently marked 11
  onSubmit tests as passing if the test setup broke.
- **Stub-Link / stub-FieldRenderer mocks widened to capture more
  props.** The narrowest mock (`<a href={to}>` ignoring `params`)
  meant the test couldn't see if the source dropped the `params={{formId}}`
  prop. New mocks expose props as `data-*` attributes so the test can
  pin the wiring without un-mocking entirely.

### 5 real source bugs uncovered, pinned with RED tests

Tests were updated to assert the **correct post-fix behaviour** and
left red. Each carries an inline
`// Currently RED: ... Source fix tracked separately.` comment. See
`docs/plans/forms-test-review-source-fixes.md` for the PR backlog.

1. `apps/forms/src/lib/api/forms.ts:200` — `/form-drafs/` typo
2. `apps/forms/src/lib/api/forms.ts:69-74` — missing `break` after `case 404:`
3. `apps/forms/src/lib/form-builder/validation-methods.ts:23-24` —
   `valueIsEmpty` falsy-strips `false` and `0`
4. `apps/forms/src/lib/form-builder/validation-methods.ts:484/491` —
   `evaluateCondition` gt/lt truthy guard skips `0`
5. `apps/forms/src/lib/form-builder/helpers/repeatable-helper.ts:269-272` —
   `splice(pos, length - 2)` is a no-op when `length === 2`

A sixth issue (`safe-payment-url.ts` reading `process.env` instead of
`import.meta.env`) cannot be reliably reproduced inside Jest because
Node provides `process`. Captured via `describe.skip` with a note
describing what the post-fix test should look like.

## Final state

- 625 tests · 617 pass · **7 red (all intentional)** · 1 skipped
- Coverage: statements 95.37% · branches 90.27% · functions 92.27% ·
  lines 96.36%

## Why we did it that way

**Test the test, not the implementation.** The /code-review pass
treated each spec as an artifact under review in its own right.
Findings like "tautological `toBeDefined()` after a non-null query"
or "regex `/Alice/` matches both Alice and Alice Smith" don't show up
in line/branch coverage — they only show up if you ask "what would
this test catch?" The strengthening exercise was about closing that
gap.

**Red tests over deleted ones for real bugs.** When the review found
a real source bug, the existing test was usually codifying the bug
("strips fields with boolean false values" — yes, that's the bug).
The mechanical move would be to either delete the assertion or
weaken the test back to "doesn't throw." Both lose information.
Pinning the correct behaviour as red, with an inline comment
pointing to the deferred fix, keeps the source defect visible at
every CI run and gives the follow-up PR an unambiguous green target.

**Widen mocks instead of un-mocking.** Several findings flagged
"FieldRenderer is mocked to a stub div, so wiring isn't verified."
Fully un-mocking would have pulled the whole form-rendering pipeline
into a unit test. Widening the mock to expose props as
`data-*` attributes lets the test pin the wiring (e.g. that
`insetFieldsByOption` carries the right entries) at unit-test cost.

**`resetAllMocks` not `clearAllMocks` in module-scope-mock specs.**
Jest's `clearAllMocks` resets only `mock.calls` and `mock.results`;
`mockReturnValue`/`mockResolvedValue` implementations survive between
tests. Specs that share a module-scope mock object across tests (the
form-renderer spec sets `mockForm.getFieldValue.mockReturnValue("yes")`
in one test and `"no"` in another) need `resetAllMocks` to keep test
order from changing behaviour.

**Use the failing-test punchlist as the follow-up PR backlog.** The
session deliberately did NOT touch source files. The deferred fixes
are documented in `docs/plans/forms-test-review-source-fixes.md`
broken out as 6 candidate PRs with the failing test cited for each.
That artifact is the only output of this session the user explicitly
asked for; the rest of the work (test strengthening) lives in the
diff.

## What we didn't do

- **Source fixes.** Five real bugs are pinned red but not fixed —
  intentional, per the working agreement at the start of the
  session. The follow-up backlog is `docs/plans/forms-test-review-source-fixes.md`.
- **Coverage threshold ratcheting.** `apps/forms/jest.config.ts`
  still has the conservative `13/14/23/24` thresholds set in an
  earlier session. Once the 7 red tests go green via source fixes,
  the thresholds can be ratcheted up to match actuals (~89/92/95/95).
- **`routeTree.gen.ts` formatting churn.** TanStack Router's
  autogenerated route tree reformatted itself during testing
  (double → single quotes, semicolons stripped). Left unstaged —
  unrelated to this work and will regenerate cleanly.
