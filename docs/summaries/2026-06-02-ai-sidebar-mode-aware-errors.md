# Mode-aware AI sidebar error messages

**Issue:** [#583](https://github.com/govtech-bb/gov-bb/issues/583)

## Context

The Form Builder AI sidebar (`apps/form_builder/app/routes/builder/-ai-sidebar.tsx`)
has two AI flows — PDF/image upload and text-instruction edit — that shared one
error transformer, `toMessage`. TanStack Start collapses several distinct
server-fn failures (edge 413, serialization failure, dropped connection) to the
generic string `"Invariant failed"`, and `toMessage` mapped that string to
PDF-specific copy. So an **edit** failure told the user to "try a smaller PDF"
even though no PDF was ever involved.

## What we did

- Gave `toMessage` a `mode: "upload" | "edit"` argument and branched the
  `"Invariant failed"` copy on it. Upload keeps the existing PDF-size hint; edit
  gets its own copy with no PDF mention. Non-`"Invariant failed"` errors still
  surface raw.
- Passed `"upload"` from `handleUpload`'s catch, `"edit"` from
  `handleEditForm`'s catch.
- Added two tests in `-ai-sidebar.spec.tsx` covering both modes.

## Why we did it that way

- **One function with a `mode` arg, not two transformers.** The
  `instanceof Error` / raw-message handling is shared; splitting into two
  functions would duplicate it for no gain. The branch is only on the
  `"Invariant failed"` copy.
- **The upload test needed a jsdom workaround.** `handleUpload` calls
  `fileToBase64`, which calls `file.arrayBuffer()` — jsdom's `File` doesn't
  implement it, so the upload flow threw `"file.arrayBuffer is not a function"`
  and never reached `convertRecipe`'s error path. We stub `arrayBuffer` on the
  test `File` so the flow gets far enough to exercise the `"Invariant failed"`
  branch we actually care about. Without the stub the test fails for the wrong
  reason.

## Open questions

None. Edit-mode wording is taken verbatim from the issue's suggested copy.
