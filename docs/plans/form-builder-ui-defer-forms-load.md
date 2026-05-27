# Form Builder UI: defer the forms list off the critical load path

Issue: [#234 — Form Builder UI: significant lag when opening](https://github.com/govtech-bb/gov-bb/issues/234)

## Goal

Make `/builder/ui` (the visual editor) render promptly on first visit. Today the
page does not paint until the blocking route loader resolves, and that loader
waits on `listForms()` — a slow, uncached GitHub-API waterfall. After this
change the editor renders as soon as the catalog is ready; the list of existing
forms loads in the background and is only ever needed when the user clicks
**Open**.

## Why it's slow

The `/builder/ui` route loader awaits two things before the page renders:

```js
loader: async () => {
  const [catalog, forms] = await Promise.all([
    getCatalogFn(),   // 60s server-side cache → usually cheap
    listForms(),      // NO cache; slow
  ]);
  return { catalog, forms };
},
```

`listForms()` (`app/server/forms.ts:13`) calls `listPublishedForms()`
(`app/server/github-recipes.ts:72`), which is a **serialized `1 + 2N` GitHub
Contents-API waterfall**: one call to list form directories, then for *each*
published form a `listVersions` call followed by a `fetchRecipeFile` call, in a
serial `for` loop, with no caching. That latency is paid on every first load and
grows with the number of published forms — and the whole editor is held behind
it even though the forms list is only consumed by the **Open** picker.

`forms` is read in exactly one place — passed to `<FormPicker>` at
`app/routes/builder/ui/index.tsx:428` — and `FormPicker` only mounts when
`isPickerOpen` is true. So the editor never needs `forms` to render.

## Approach

**Drop `listForms()` from the blocking loader; fetch it client-side on mount
(prefetch-on-mount).** The catalog stays in the loader — it *is* needed for the
first render (`StepEditor`, and the `findRecipeIdCollisions` memo) and is cheap
thanks to its 60s server cache.

The forms list is fetched in a `useEffect` right after the first render, stored
in component state, and handed to `FormPicker`. By the time the user clicks
**Open** the list is usually already there; if not, the picker shows a brief
loading state.

Alternatives considered:

- **Fetch-on-open (fully lazy).** Only fetch when the picker opens. Leaner (zero
  cost if the user never opens it), but the picker would always show a spinner
  on first open. Rejected in favour of prefetch-on-mount per the issue
  discussion ("async after the rest of the UI loads") — same critical-path win,
  better picker UX.
- **TanStack deferred/streaming loader** (`<Await>` on an un-awaited promise).
  More idiomatic for router data, but heavier to wire for data only one modal
  consumes. Plain component state is simpler and sufficient here.

`listForms` is already a `createServerFn` guarded by `requireSession`; calling it
from the client is an RPC that carries the session cookie automatically (the
`/builder` route's `beforeLoad` has already guaranteed a session). It is invoked
with no args today, so the client call site is unchanged.

This change deliberately **does not** touch the underlying GitHub waterfall — it
just moves it off the critical path. See Open questions.

## Scope

- Loader returns only `{ catalog }`; remove `listForms()` from it.
- `BuilderPage` gains `forms` state (`FormDefinitionSummary[] | null`, `null` =
  still loading) plus a load-error flag, populated by a mount `useEffect` that
  calls `listForms()`.
- Pass `forms` (and a loading/error signal) to `FormPicker`.
- `FormPicker` distinguishes **loading** (show "Loading forms…") from **loaded
  but empty** (existing "No forms found.") and surfaces a fetch error.

## Files

- `apps/form_builder/app/routes/builder/ui/index.tsx`
  - Loader: `const catalog = await getCatalogFn(); return { catalog };`
  - `Route.useLoaderData()` → destructure `catalog` only.
  - Add `import type { FormDefinitionSummary } from "../../../types/index";`.
  - Add `forms` + error state and the mount `useEffect` (guard against setting
    state after unmount).
  - Update the `<FormPicker .../>` props.
- `apps/form_builder/app/routes/builder/ui/-form-picker.tsx`
  - Accept the loading/error signal; render "Loading forms…" while `forms` is
    null and an error line if the fetch failed.

## Verify

- `pnpm exec nx run-many -t build` and `pnpm exec nx run-many -t test` both
  green (form-builder-app tests run via `nx test form-builder-app`).
- Manual smoke (real browser, deployed sandbox + local `vite dev`): open
  `/builder/ui` cold — the editor chrome (toolbar, step list, empty-state)
  paints without waiting on the forms fetch; click **Open** and confirm the
  picker populates (after a short load on a cold hit) and loading a form still
  works.
- Sanity-check that the catalog-dependent paths (`StepEditor`, the duplicate-ID
  panel) are unaffected.

## Open questions / follow-ups

- **Underlying waterfall (separate issue).** `listPublishedForms` is `1 + 2N`
  serial GitHub calls with no cache. Even off the critical path it's slow and
  risks GitHub rate limits. Candidate follow-up: parallelize per-form fetches
  and/or add a short server-side cache (mirroring the catalog's 60s cache).
- **Picker refetch.** Should reopening the picker reuse the mounted fetch (yes,
  it's in component state) or refresh? Current plan: fetch once on mount; a
  manual refresh affordance can come later if needed.
