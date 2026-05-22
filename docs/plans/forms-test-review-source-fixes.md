# Follow-up source fixes from forms test review

**Status:** Backlog. Ready to break out into individual PRs.

## Context

A code review of the unit tests in `apps/forms/src` (May 22 2026)
uncovered five real source bugs that the test suite had been passing
over. Per the working agreement for that session, the tests were
updated to **pin the correct post-fix behaviour** (red) without
touching the source — leaving the source fixes to dedicated follow-up
PRs. This document is the punchlist.

The branch `test/increase-coverage` currently has 7 failing tests, all
intentional. Each is annotated in-source with
`// Currently RED: ... Source fix tracked separately.` Until these
source fixes land, the suite stays red on these specific tests; the
remaining 617 tests pass.

## PR backlog

Each section below maps to one suggested PR. They are independent and
can land in any order.

---

### PR 1 — Fix `/form-drafts/` typo in `deleteFormDraft`

**Source:** `apps/forms/src/lib/api/forms.ts:200`

```ts
const endpoint = `/form-drafs/${draftId}`;   // ← missing 't'
```

**Failing test that pins the correct behaviour:**

- `apps/forms/src/lib/api/forms.spec.ts` →
  `deleteFormDraft › calls fetch with DELETE method against the correct /form-drafts/:id URL`

**Why it matters:** Every production DELETE against `/form-drafs/<id>`
hits a non-existent route on the backend. The test never inspected the
URL before, so the typo went undetected.

**Fix:** Change the endpoint string to `/form-drafts/${draftId}`. No
other changes needed; the test will go green.

---

### PR 2 — Add `break` after `case 404:` in `makeFetch` switch

**Source:** `apps/forms/src/lib/api/forms.ts:69-74`

```ts
switch (response.status) {
  case 404:
    message = errorMessage.not_found ?? "Requested item was not found";
  default:                                   // ← missing break above
    message = `Failed to load form (HTTP ${response.status}).`;
}
```

The 404 branch falls through to `default`, so the per-endpoint
`not_found` message is always clobbered by the generic copy.

**Failing test:**

- `apps/forms/src/lib/api/forms.spec.ts` →
  `fetchFormDefinition › throws FormFetchError when response is not ok (404)`
  (now asserts the `message` field)

**Fix:** Add `break;` after the 404 case body. Consider also covering
common statuses (`400`, `401`, `403`, `500`) while the file is open;
those branches don't currently exist but the pattern is the same.

---

### PR 3 — `valueIsEmpty` must not treat `0` or `false` as empty

**Source:** `apps/forms/src/lib/form-builder/validation-methods.ts:23-24`

```ts
export function valueIsEmpty(value: ...): boolean {
  if (!value) return true;       // ← falsy-strip: 0 and false fall here
  if (typeof value === "string") return value.length === 0;
  ...
}
```

The `!value` guard treats every falsy value as empty. Downstream,
`formatDataForSubmission` filters via `!valueIsEmpty(v)`, so
`accepted: false` and `dependents: 0` are silently stripped from
submissions.

**Failing tests:**

- `apps/forms/src/lib/api/forms.spec.ts` →
  `formatDataForSubmission › empty values stripping › keeps fields with boolean false values`
- `apps/forms/src/lib/api/forms.spec.ts` →
  `formatDataForSubmission › empty values stripping › keeps fields with numeric 0 values`

**Fix:** Replace the falsy guard with explicit `null`/`undefined`/`""`
checks. Something like:

```ts
if (value === null || value === undefined) return true;
if (typeof value === "string") return value.length === 0;
if (Array.isArray(value)) return value.length === 0;
// boolean, number, etc. → not empty
return false;
```

Verify the change against the full `valueIsEmpty` test block — empty
strings, empty arrays, and the incomplete `DateValueInput` shapes
must still return `true`.

**Caveat:** Audit consumers before merging. Any code that relied on
`valueIsEmpty(false) === true` (e.g. "skip optional checkbox") will
break. The submissions case is the obvious one; there may be others
in validators or conditional logic.

---

### PR 4 — `evaluateCondition` gt/lt must allow `0` as an operand

**Source:** `apps/forms/src/lib/form-builder/validation-methods.ts:484` and `:491`

```ts
case "gt":
  if (conditionValue && targetFieldValue) {    // ← truthy guard skips 0
    return Number(conditionValue) > Number(targetFieldValue);
  }
  return false;
```

The truthy guard short-circuits whenever either side is `0`, so
`evaluateCondition(5, 0, "gt")` returns `false` even though `5 > 0`.

**Failing tests:**

- `apps/forms/src/lib/form-builder/validation-methods.spec.ts` →
  `evaluateCondition › gt › returns true when conditionValue > 0 and target is 0`
- `apps/forms/src/lib/form-builder/validation-methods.spec.ts` →
  `evaluateCondition › lt › returns true when conditionValue is 0 and target is positive`

**Fix:** Use an explicit "is numeric" check instead of the truthy
guard. For example:

```ts
case "gt": {
  const a = Number(conditionValue);
  const b = Number(targetFieldValue);
  if (Number.isNaN(a) || Number.isNaN(b)) return false;
  return a > b;
}
```

The existing `non-numeric` tests (string operand on either side)
still need to return `false` — verify with the full describe block.

---

### PR 5 — `removeRepeatableStep` orphan cleanup is a no-op when length === 2

**Source:** `apps/forms/src/lib/form-builder/helpers/repeatable-helper.ts:269-272`

```ts
if (pos !== -1) {
  currentRepeatConfig.orderedStepIds.splice(
    pos,
    currentRepeatConfig.orderedStepIds.length - 2,
  );
}
```

When the target step is no longer in `visibleSteps` (e.g. the user
removed it via a sibling action), the code attempts to trim the
orphan id from `orderedStepIds`. With
`orderedStepIds = ["personalInfo", "personalInfo~1"]` and `pos = 1`,
the call becomes `splice(1, 0)` — a no-op. The orphan id is left in
session settings indefinitely.

**Failing test:**

- `apps/forms/src/lib/form-builder/helpers/repeatable-helper.spec.ts` →
  `removeRepeatableStep › removes the orphan id from orderedStepIds when targetStep is not in visibleSteps`

**Fix:** The intent appears to be "delete from `pos` to the end."
Replace the deletion length with `orderedStepIds.length - pos`:

```ts
currentRepeatConfig.orderedStepIds.splice(
  pos,
  currentRepeatConfig.orderedStepIds.length - pos,
);
```

Or, if only the single orphan id should be removed (not all trailing
ids), use `splice(pos, 1)`. Pick whichever matches the broader
repeatable-step lifecycle — recommend skimming the consumers in
`form-renderer.tsx` before deciding.

---

### PR 6 (separate concern) — Switch payment-allowlist env access to `import.meta.env`

**Source:** `apps/forms/src/lib/security/safe-payment-url.ts:5-7`

```ts
const raw =
  typeof process !== "undefined"
    ? process.env?.VITE_PAYMENT_ALLOWED_ORIGINS
    : undefined;
```

Vite only inlines `import.meta.env.VITE_*` at build time. The browser
bundle has no `process` global, so the guard always short-circuits to
`undefined` and the custom allowlist override is silently ignored in
production. The Jest (Node) tests pass because Node provides
`process.env`.

**Pinned test:** `apps/forms/src/lib/security/safe-payment-url.spec.ts`
has a `describe.skip` block titled
`via env (Vite) — un-skip when source reads import.meta.env` with a
note describing what the post-fix test should look like.

**Fix:**

```ts
const raw = import.meta.env?.VITE_PAYMENT_ALLOWED_ORIGINS;
```

Plus a Jest setup tweak (or a `globalThis.import = { meta: { env: ... } }`
shim in the spec) to make `import.meta.env` accessible in tests, then
un-skip the test block and replace its placeholder.

**Caveat:** Confirm Vite's behaviour for runtime-deployed env vars vs
build-time inlining. If the override needs to be runtime-settable, a
different mechanism (window-config script, fetched config endpoint) is
required and this PR becomes larger.

---

## Suggested PR ordering

1. PRs 1, 2, 5 are localised and low-risk. Land together or
   independently.
2. PR 4 has limited blast radius (only `gt`/`lt` operators); land
   before depending on `0`-valued conditional logic anywhere.
3. PR 3 has the broadest blast radius — audit `valueIsEmpty` consumers
   first.
4. PR 6 has the largest scope (build/runtime env strategy); treat it
   as its own design decision.
