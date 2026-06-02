# Filter email-processor recipient picker to email-like fields

## Context

Implemented from `docs/plans/email-recipient-filter-email-fields.md` on worktree
branch `feat/563-email-recipient-filter` (merges into `sandbox`). Issue
[#563](https://github.com/govtech-bb/gov-bb/issues/563).

In the form builder's **email processor** config, the **Recipient field** picker
(`ValuePathPicker`) listed *every* resolved form field. An author could pick a
name or date field as the email recipient — producing a processor that fails or
misbehaves at send time.

## What we did

- **Call-site filter** (`apps/form_builder/.../-processor-config-form.tsx`, the
  `email` case) — `recipientFields = fields.filter((f) => f.fieldId.toLowerCase().includes("email"))`,
  passed to `ValuePathPicker` in place of the raw `fields`. The picker itself is
  unchanged and stays generic.
- **Tests** (`-processors-editor.spec.tsx`) — revised the existing picker test
  to assert a non-email field (`full-name`) is now excluded; added a case
  covering inclusion of `email` / `applicant-email` / mixed-case `Email` and
  exclusion of `full-name` / `dob`; added the empty case (no email-like field →
  only the `— select field —` placeholder). `Harness` gained an optional
  `fields` prop so a test can supply its own field set.

## Why we did it that way

- **Filter at the call site, not in the picker.** `ValuePathPicker` has a single
  consumer today but is written as a generic `stepId.fieldId` selector. Adding an
  `onlyEmail`/`filter` prop, or hardcoding the email rule inside it, would couple
  a reusable control to a one-off recipient rule. The call site is where the
  "this select is for an email recipient" knowledge lives, so the filter lives
  there too. Rejected both alternatives (see the plan's "Alternatives
  considered").
- **Match `fieldId` only, not `display`.** The request was "fields whose id looks
  like an email field." Matching `display` too would be broader but fuzzier
  (a "Confirm e-mail address" label with id `confirm` wouldn't match; a
  "Customer email" with id `customer` would falsely match on display). Taking the
  literal `fieldId` reading keeps the rule predictable.
- **No ADR.** Neither the call-site placement nor the `includes("email")`
  heuristic establishes a principle future work must respect — they're localized
  to this one picker. The reasoning is captured here and in the plan.

## Why this is safe

A previously-saved non-email recipient is **not** silently dropped: filtering the
*input* list doesn't touch `ValuePathPicker`'s existing `showCurrent` logic, which
keeps any value matching no listed field as a `(current)` option. Confirmed by the
unchanged passing tests around saved recipient paths.

## Open questions

None.
