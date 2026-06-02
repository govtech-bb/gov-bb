# Plan: Filter email-processor recipient picker to email-like fields

**Issue:** [#563](https://github.com/govtech-bb/gov-bb/issues/563)
**Area:** frontend / `apps/form_builder` (form builder only)

## Goal

In the form builder's **email processor** config, the **Recipient field** picker
should only offer fields whose id looks like an email field — concretely, fields
whose `fieldId` contains a case-insensitive `"email"` (e.g. `email`,
`applicant-email`, `Email`). This stops an author from picking a name or date
field as the email recipient, which would produce a processor that fails or
misbehaves at send time.

## Approach

Filter the `fields` array **at the call site** in `-processor-config-form.tsx`
(the `email` processor case) before passing it to `ValuePathPicker`. The picker
stays generic — it keeps rendering whatever fields it's given — so it remains
reusable for other value-paths later.

Match on `fieldId` only:

```ts
const recipientFields = fields.filter((f) =>
  f.fieldId.toLowerCase().includes("email"),
);
```

**Alternatives considered:**

- *Add an `onlyEmail`/`filter` prop to `ValuePathPicker`.* Co-locates the rule
  with the picker but adds API surface for a one-off rule. Rejected — call-site
  filter is simpler and the picker has a single consumer today.
- *Hardcode the filter inside `ValuePathPicker`.* Couples a generic picker to
  the email-recipient rule. Rejected.
- *Match `fieldId` or `display`.* Broader, but "their id" in the request points
  at `fieldId`. Rejected in favour of the literal reading.

## Why this is safe

- **Legacy values preserved.** `ValuePathPicker` already keeps an existing value
  that matches no listed field as a `(current)` option (see its `showCurrent`
  logic). A previously-saved non-email recipient therefore still shows and is not
  silently dropped — filtering the input list doesn't change that.
- **No email-like fields.** The select shows just the `— select field —`
  placeholder, which correctly nudges the author to add an email field.

## Scope

- Filter `fields` to email-like `fieldId`s in the `email` case of
  `ProcessorConfigForm`, passing the filtered list to `ValuePathPicker`.
- Update the existing picker-population test (the `full-name` field must no
  longer appear as an option).
- Add a test asserting non-email fields are excluded and email-like fields
  (incl. mixed-case / `applicant-email`) are included.
- Add a test for the empty case (no email-like fields → only the placeholder).

## Files

- `apps/form_builder/app/routes/builder/-processor-config-form.tsx` — apply the
  filter in the `email` case (~line 60, before `<ValuePathPicker>`).
- `apps/form_builder/app/routes/builder/-processors-editor.spec.tsx` — update
  the existing "populates the recipient-field picker from the form's fields"
  test (line ~87) and add the exclusion / empty-case tests. The `FIELDS` fixture
  already has `email` + `full-name`, so it exercises both cases.

## Verify

```bash
pnpm exec nx run form_builder:test
pnpm exec nx run-many -t build --exclude=landing
```

- Recipient picker for an email processor lists only email-like fields.
- A form with a saved non-email recipient still shows it as `(current)`.
- A form with no email-like fields shows only the placeholder.

## Open questions

None outstanding — match target (`fieldId`) and placement (call site) confirmed.
