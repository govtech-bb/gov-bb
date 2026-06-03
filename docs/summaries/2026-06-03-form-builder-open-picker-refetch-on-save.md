# Keep the Form Builder Open picker fresh after saving (#616)

## Context

The Open modal's form list comes from `useFormsList()`
(`apps/form_builder/app/routes/builder/-use-forms-list.ts`), which fetches once
on mount and exposes a `refetch()`. The route loader no longer owns this data,
so router invalidation can't refresh it — every mutation flow refreshes the list
by calling `refetchForms()` afterward (delete, disable, enable) **except** the
save flow. So a newly created form never reached the picker until a reload, and
a re-saved form kept its old `v…` badge/title.

`refetchForms()` re-runs `listForms()`, a slow three-call GitHub-API waterfall
(`apps/form_builder/app/server/forms.ts`). We didn't want to pay that on every
routine re-save. Plan: `docs/plans/616-form-builder-open-picker-refetch-on-save.md`.

## What we did

- **`-use-forms-list.ts`** — added an `upsertForm(summary)` callback (and its
  `FormsListState` entry). It replaces the row matching `formId` in local state
  (or appends if absent), with no server round-trip. It no-ops while the mount
  fetch is still in flight (`forms === null`) — there's nothing to patch and the
  pending fetch will bring the authoritative list. Uses the functional
  `setForms` updater with `slice()`+index-assign so it stays immutable and the
  callback is stable (`useCallback([])`).
- **`index.tsx` `handleSubmit`** — after a successful save, branch on whether
  the picker entry is being **added** or **updated**:
  - **New form** (`draft.formId !== loadedFromId`) → `refetchForms()` for the
    full server-merged row. New forms are infrequent, so one slow call is fine.
  - **Re-save** → `upsertForm(...)` patched from data we already hold.

  The new-vs-resave condition (`isNew`) is captured **before**
  `setLoadedFromId(draft.formId)` overwrites `loadedFromId`. `isNew` is now
  computed once and reused for both the `submitRecipe` call and the picker
  branch.

## Why the upsert mirrors the listForms merge

The picker must show what a `refetch()` would, so the client-side summary has to
replicate `listForms`'s merge rules — the subtle part of this change:

- `listForms` keys each row by `formId`, then lets a **published** entry win
  unless a draft's version is *strictly greater* (`forms.ts:26-36`).
- **Version bump** (the `submitRecipe` path, e.g. 2.0.0 → 2.0.1): the new draft
  becomes the highest version, so the merge marks the row `isPublished: false`
  (per-row action becomes Delete, not Disable). The upsert forces `false`.
- **Same-version in-place save** (the `updateRecipe` path — reachable because
  `SubmitModal` permits a version equal to current): draft version *ties*
  published, so published still wins and the row stays `isPublished: true`.
  Hardcoding `false` here would wrongly drop the Published badge until reload.
  The upsert preserves the existing row's `isPublished` on this path.
- Draft rows carry a backend-assigned `id` distinct from `formId`
  (e.g. `"uuid-1"`); the upsert preserves the matched row's `id` and only
  synthesises `id: formId` when appending a row it has never seen.

The first two `isPublished` cases came out of code review — the original plan
only reasoned about the version-bump path and would have mislabeled a
same-version published re-save.

## Alternatives rejected

- **Always full-refetch after every save** — consistent with delete/disable but
  re-runs the slow waterfall on every save. The upsert gets the same freshness
  for re-saves without the network cost.
- **Server-side single-id summary fetch** — no cheap endpoint exists;
  `listForms` merges three endpoints and `getRecipe` returns a full recipe, not
  a summary. Would need new `form_builder_api` routes — out of proportion.

## Tests

- Hook: `upsertForm` replaces in place without refetching, appends when absent,
  no-ops while loading.
- `index.spec`: new-form save fires `refetch` (not upsert); version-bump re-save
  upserts with the fresh title/`v2.0.1`, `isPublished: false`, preserved `id`;
  same-version in-place re-save preserves `isPublished: true`.
