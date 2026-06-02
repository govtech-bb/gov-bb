# Plan: Mode-aware AI sidebar error messages

**Issue:** [#583](https://github.com/govtech-bb/gov-bb/issues/583)

## Goal

When an AI-assistant operation in the Form Builder fails, the message shown to
the user should match the operation they actually performed. Today an **edit**
that fails can tell the user to "try a smaller PDF" even though no PDF was ever
uploaded.

## Background

`apps/form_builder/app/routes/builder/-ai-sidebar.tsx` has two AI flows that
share one error transformer:

- `handleUpload` — PDF/image → recipe (line ~87)
- `handleEditForm` — text instruction + current recipe → modified recipe (line ~110)

Both pass their caught error through `toMessage` (lines ~61–66):

```ts
const toMessage = (err: unknown): string => {
  const raw = err instanceof Error ? err.message : "Unknown error";
  return raw === "Invariant failed"
    ? "Upload failed — the file may be too large or the connection was interrupted. Try a smaller PDF (under 4 MB)."
    : raw;
};
```

TanStack Start reduces several distinct server-fn failures (edge 413,
serialization failure, dropped connection) to the generic string
`"Invariant failed"`. The transformer only knows that string — not which flow
produced it — so an edit failure inherits the PDF copy.

## Approach

Make `toMessage` mode-aware by passing the operation context, so each flow's
`"Invariant failed"` case maps to an appropriate message. The non-`"Invariant
failed"` path stays as-is (it just surfaces the raw error message).

Chosen shape: give `toMessage` a `mode` argument (`"upload" | "edit"`) and
branch the `"Invariant failed"` copy on it.

- **upload** → existing copy: *"Upload failed — the file may be too large or the
  connection was interrupted. Try a smaller PDF (under 4 MB)."*
- **edit** → *"The edit request failed — your form may be too large or the
  connection was interrupted. Try again, or simplify your request."*

**Alternatives considered**

- *Two separate transformer functions* — more code for no real gain; a single
  function with a `mode` arg keeps the shared `instanceof Error` handling in one
  place.
- *Leave it as-is* — rejected; the misleading message is the bug.

## Scope

- Add a `mode` parameter to `toMessage` and branch the `"Invariant failed"`
  message on it.
- Pass `"upload"` from `handleUpload`'s catch, `"edit"` from `handleEditForm`'s
  catch.
- Add/extend a unit test asserting that an `"Invariant failed"` error in edit
  mode does **not** mention PDFs and upload mode still does.

## Files

- `apps/form_builder/app/routes/builder/-ai-sidebar.tsx` — modify `toMessage`
  and its two call sites.
- The component's test file (if present) — add coverage for both modes.

## Verify

- `pnpm exec nx run-many -t build --exclude=landing`
- `pnpm exec nx run-many -t test`
- Manual: trigger an edit-mode failure and confirm the message no longer
  references PDFs; trigger an upload-mode size failure and confirm the PDF hint
  is unchanged.

## Open questions

- Exact edit-mode wording — current draft is *"The edit request failed — your
  form may be too large or the connection was interrupted. Try again, or
  simplify your request."* Adjust during implementation if a better phrasing
  emerges.
