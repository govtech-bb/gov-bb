# "View recipe JSON" action in the builder's Preview modal

## Context

Implemented from `docs/plans/744-form-builder-preview-recipe-json.md` on
worktree branch `worktree-worktree-744-preview-recipe-json` (merges into
`sandbox`). Issue [#744](https://github.com/govtech-bb/gov-bb/issues/744).

Debugging recipe-level bugs (e.g. #565, where a conditional `value` landed as
`"true"` instead of `true`) required querying the API or DB directly — the
builder UI gave no way to see the recipe JSON it was producing. The ask: from
the Preview modal, open the raw recipe JSON of the **current in-memory draft**
in a new tab — the exact payload `serializeRecipeDraft` produces, i.e. what
Save draft / Deploy would persist.

## What we did

- **`apps/form_builder/.../builder/index.tsx`** — new `previewRecipeJson`
  state, set in `handlePreview` *before* the `previewRecipe` request fires, and
  cleared at every site `previewData` is cleared (New/load/discard paths and
  the modal's `onClose`). Passed to `PreviewModal` as a `recipe` prop.
- **`-preview-modal.tsx`** — new optional `recipe` prop; when set, a
  **"View recipe JSON"** button renders next to the "Preview saved form" link.
  Click → `JSON.stringify(recipe, null, 2)` → `application/json` Blob →
  `URL.createObjectURL` → `window.open(url, "_blank", "noopener,noreferrer")`
  → `setTimeout(revoke, 60_000)`.
- **`-preview-modal.spec.tsx`** — 4 unit tests: renders only when `recipe` is
  set, opens the pretty-printed JSON blob in a new tab, revokes the URL on the
  delayed timer.
- **`index.spec.tsx`** — 2 integration tests (preview-failure and
  preview-success paths both expose the action), plus the `previewRecipe` mock
  threaded out of the `jest.mock` factory so tests can drive it, and an
  `afterEach` reset so the armed mock can't leak into future tests.

## Why we did it that way

- **Client-side blob URL, not an API endpoint** — the data already lives in
  the client, and an endpoint would serve the *saved* recipe, lagging
  in-memory edits (the very thing being debugged). No auth/preview-token
  plumbing needed. (Alternatives recorded in the plan; a hydrated
  `ServiceContract` view was deferred until a need shows up.)
- **Capture before the request, not from the response** — the recipe state is
  set before `await previewRecipe(...)`, so the JSON is inspectable while the
  contract is loading and, crucially, when the request **fails** — failure is
  exactly when an author wants to eyeball the payload.
- **Delayed revoke (60s), not immediate** — revoking synchronously would race
  the new tab's navigation to the blob URL; the timer revokes after the tab
  has read it, popup-blocked or not, so blobs don't accumulate.
- **Snapshot semantics accepted** — the JSON reflects the draft as of the
  Preview press, same as the rest of the modal; edits made while the modal is
  open require pressing Preview again.

## Gotchas

- **jsdom's `Blob` has no `.text()`** — the unit test originally asserted
  `await blob.text()`; that's a `TypeError` under jsdom. The spec instead
  shims `globalThis.Blob` with a subclass that captures the constructor
  `parts`, asserted synchronously (also avoids fake-timer/promise interplay).
- **Run jest from `apps/form_builder`, not the repo root** — from the root,
  `npx jest` resolves a Babel-based config that can't parse `import { type X }`
  syntax; the app's own ts-jest config must be the one picked up.

## Verification

- `npx jest` (form_builder, worktree): 31 suites / 409 tests green, plus the
  review-fix re-run. Full `nx run-many -t build --exclude=landing` and
  `tsc -b` deferred to the main checkout / CI per the worktree limitation.
- Code review (high effort): zero correctness/security/convention findings;
  one latent test-isolation nit, fixed (`afterEach` mock reset).
- Manual browser check (real new tab showing the JSON) not yet performed —
  blob/`window.open` are mocked in jsdom.
