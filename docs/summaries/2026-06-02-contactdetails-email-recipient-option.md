# `contactDetails.email` is a selectable email-recipient option

**Issue:** [#547](https://github.com/govtech-bb/gov-bb/issues/547)

## Context

The runtime already resolves a `contactDetails.`-prefixed `recipientField` from
the service contract (the reserved-namespace convention recorded in
[ADR 0023](../decisions/0023-contact-details-is-a-reserved-recipientfield-namespace.md),
seeded onto the "MDA Email" processor by #501). But in the builder, an author
could not **choose** `contactDetails.email` from scratch.

The Recipient field control is `ValuePathPicker`, whose options come from
`resolveFieldIds(draft, catalog)` — which walks only `draft.steps[].fields`. The
reserved `contactDetails.email` path is not a form field, so it was never
enumerated. It only appeared at all on the **seeded** MDA Email processor, where
it survived via the picker's `showCurrent` (`… (current)`) fallback. Add a new
email processor, or change the recipient on an existing one, and the MDA contact
email was simply not offered.

## What we did

A minimal, email-only fix that threads one extra option down to the picker:

- **`-value-path-picker.tsx`** — added an optional
  `extraOptions?: { value; label }[]` prop, rendered as `label (value)` (mirroring
  the existing `display (path)` format of field options). Two dedup guards: the
  `showCurrent` fallback now also excludes extra-option values (so a seeded
  `contactDetails.email` renders once, not twice), and extra options whose value
  already matches a real field path are dropped.
- **`-processor-config-form.tsx`** — accepts a `hasContactDetails` flag; the email
  branch passes `[{ value: "contactDetails.email", label: "MDA contact email" }]`
  to the picker when set, nothing otherwise.
- **`-processors-editor.tsx`** — derives
  `hasContactDetails = draft.contactDetails !== undefined` and threads it to every
  `ProcessorConfigForm`.
- Specs — picker: renders/selects extra options, dedup vs `(current)`, dedup vs a
  colliding field path; editor: option present with contact details, absent
  without, and selection writes `config.recipientField`.

## Why we did it that way

- **`draft.contactDetails !== undefined` is a sufficient gate.**
  `contactDetailsSchema` makes `email` a required `z.string().email()`, so a
  present `contactDetails` always carries an email — no need to inspect the field
  itself. The emitted value `"contactDetails.email"` matches the runtime's
  `CONTACT_DETAILS_PREFIX` resolution, so UI and server stay wired end to end.
- **Generic `extraOptions` prop rather than a `contactDetails`-specific one.**
  `ValuePathPicker` is used in exactly one place (the email recipient field), so
  the change is well-contained, but a generic "non-field selectable path" prop
  keeps the picker honest about what it renders and leaves room for future
  reserved paths without another bespoke flag.
- **Collision dedup is defensive, not load-bearing.** A step literally named
  `contactDetails` with an `email` field would otherwise render the value twice;
  the runtime shadows such a step anyway, so this is a one-line guard against a
  reserved-namespace collision that should never occur, kept so the picker never
  emits a duplicate value.
- **Deferred surfacing other `contactDetails.*` keys** (phone, etc.) — out of
  scope; email is the only meaningful recipient for an email processor.

## Verify

- `nx run-many -t build --exclude=landing` (13 projects) and
  `nx run-many -t test` (13 projects, 264 passing in form-builder-app) both green.
- form-builder-app suite: 265 passing (6 new across the two specs).
