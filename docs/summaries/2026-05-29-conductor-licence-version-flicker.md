# Form builder: conductor-licence version flicker (1.3.0 → stale) on first open

## Context

Issue [#417](https://github.com/govtech-bb/gov-bb/issues/417). Opening an
existing published form (`apply-for-conductor-licence`) in the form builder
showed the version briefly as `1.3.0`, then flickered to a stale DB-derived
value — but only on the *first* open of a form per session. Implemented from
`docs/plans/417-conductor-licence-version-flicker.md` on branch
`feat/417-version-flicker` (merges into `sandbox`).

The issue's "where to look" hypotheses (a `getRecipe` precedence bug, a TanStack
hydration race, two competing fetches) were all wrong. The *content* that loads
is correct: `getRecipe` returns the GitHub-published `1.3.0` because the
published copy beats the stale `1.1.0` DB draft in the semver check. The flicker
was purely the version *label*, driven by a debounced effect:

1. The Open picker resolves `1.3.0` (the picker merge prefers the published copy
   over the stale DB draft) and `handleLoad` paints the toolbar at `1.3.0`.
2. Setting `draft.formId` fired a debounced `useEffect` that, 300 ms later,
   called `nextVersion` — an endpoint reading **only the DB**, which has no
   `1.3.0` — and overwrote the version state. Flicker.
3. On re-open `draft.formId` is unchanged, so the effect doesn't re-fire — hence
   first-open-only.

## What we did

- **Removed the debounced `nextVersion` effect**
  (`apps/form_builder/app/routes/builder/ui/index.tsx`). The loaded/working
  `version` (set only by load / new / submit) is now the single source of truth.
- **Deterministic, client-side bumps.** Derived `saveDraftVersion =
  bumpPatch(currentVersion)` and `deployVersion = bumpMinor(currentVersion)`
  (both `1.0.0` when there's no current version). SubmitModal seeds the patch
  bump; the Deploy path uses `deployVersion` for both the PublishModal display
  and the published recipe. `handleSubmit` now advances `currentVersion`/`version`
  to the just-saved version client-side instead of calling the stale endpoint.
- **Added `bumpPatch`** to `apps/form_builder/app/lib/version.ts`, with unit
  tests in `version.spec.ts`.
- **Decommissioned `nextVersion`:** removed the `nextVersion` server fn
  (`server/forms.ts`) and the `GET /:formId/next-version` route
  (`form_builder_api/src/routes/forms.ts`) — confirmed zero remaining callers —
  plus the dead test mock in `index.spec.tsx`.
- **New surgical delete:** `DELETE /builder/forms/:formId/versions/:version`
  (`form_builder_api`) deletes a single draft row — no tombstone, `404` if
  absent, `400` if the row is published (mirrors the PUT guard). Registered
  before the catch-all `DELETE /:formId` so the extra path segments aren't
  swallowed. Paired with a `deleteFormVersion` server fn. Tested in
  `forms.delete-version.spec.ts`.
- **`getRecipe` precedence tests** added to `server/forms.spec.ts`: published
  newer → published; draft newer-or-equal → draft; no published → draft; no
  draft (404) → published.
- **ADR-0019** records the client-side deterministic versioning principle.

## Why we did it that way

- **Delete the effect, don't guard it.** The plan's predecessor used an
  `openedRef` guard against StrictMode double-invoke. Once bumps move to action
  time, the effect has no remaining purpose — removing it is less code than a ref
  guard and sidesteps the StrictMode edge cases entirely.
- **Client-side bump, not a fixed `nextVersion`.** The picker merge already
  resolves the true latest published version synchronously on the client, so a
  server round-trip on the load path is both redundant and the flicker vector.
  Reading the DB for "next version" is structurally wrong: the DB is builder
  scratch (ADR-0007) and never holds the GitHub-published version. See ADR-0019.
- **Deploy cuts a minor — a free fix for a latent bug.** Publishing
  `bumpMinor(current)` rather than re-publishing `current` means a redeploy never
  collides with the existing `<current>.json` on GitHub.
- **A reusable delete-version endpoint, not a one-off SQL migration.** The stale
  conductor-licence row is cleaned by calling the new endpoint, so the cleanup is
  a repeatable operation rather than a migration artifact. Guarded to refuse
  published rows since only DB-resident drafts are deletable.
- **`context` injected in getRecipe tests is load-bearing.** In direct server-fn
  invocation under jest the `requireSession` middleware does not run, so
  `context.session` is undefined unless passed explicitly — verified empirically
  (tests fail without it).

## Status / follow-ups

- Build (`nx run-many -t build --exclude=landing`), `tsc -b`, and the full test
  suite (608 passing, 1 pre-existing skip) are green.
- **Not yet done — real-browser smoke test.** Confirm `apply-for-conductor-licence`
  reads `1.3.0` with no flicker on first open; Save draft offers `1.3.1`; Deploy
  targets `1.4.0`.
- **Not yet done — stale-row cleanup.** Isaiah runs the `SELECT`-then-`DELETE`
  against the right environment via the new endpoint. Open question: which
  environment(s) hold the stale row — sandbox only, or prod too?
