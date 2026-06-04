# 0019 — Builder version bumps are client-side and deterministic

**Date:** 2026-05-29
**Status:** Accepted

## Context

The form builder assigns a SemVer to every recipe it saves or deploys. The
original scheme computed the "next" version with a server round-trip:
`GET /builder/forms/:formId/next-version` read the latest row out of the
`form_definitions` table and returned `bumpMinor(latest)`. The builder UI called
it from a debounced `useEffect` keyed on `draft.formId`, and again after each
submit.

That coupling caused issue #417. When an author opened an existing published
form, the Open picker had already resolved the true latest version client-side
(the picker merge prefers the GitHub-published copy — e.g. `1.3.0` — over a
stale DB draft). `handleLoad` painted the toolbar at `1.3.0` correctly. But
flipping `draft.formId` then fired the debounced effect, which 300 ms later
called `next-version` — an endpoint that reads **only the DB**, where the
published `1.3.0` does not exist — and clobbered the version state with a
DB-derived value. The toolbar flickered from `1.3.0` to the stale value on first
open. (Re-open didn't flicker because `draft.formId` was already set, so the
effect didn't re-fire.)

The DB is builder scratch space, not the source of truth for what's published
(see [0007](0007-runtime-recipes-load-from-files-not-form_definitions-table.md)).
So a version derived from "latest DB row" was structurally wrong on the load
path: it could never see a GitHub-published version, and it raced the correct
client-resolved one.

We considered fixing `next-version` to read GitHub instead of the DB. Rejected:
it keeps an async round-trip on the load path (the flicker vector), when the
picker merge already gives us the true latest version synchronously on the
client.

## Decision

**Form-builder version numbers are derived deterministically and client-side
from the loaded/working version. No version is fetched from the server at
edit/load time.**

The model:

- The **loaded/working version** (`version` state, set only by load / new /
  submit) is the single source of truth and what the toolbar shows.
- **Save draft cuts a patch** — the SubmitModal seeds `bumpPatch(currentVersion)`.
- **Deploy cuts a minor** — the publish path uses `bumpMinor(currentVersion)` for
  both the PublishModal display and the published recipe, so they cannot diverge
  and a redeploy never collides with the existing `<current>.json`.
- A **brand-new form** (no current version) starts at `1.0.0` for both actions —
  no bump from nothing.
- After a Save draft, the just-saved version becomes the new current/working
  version, so the next bump is relative to it.

This supersedes the `/:formId/next-version` lookup and its `nextVersion` server
fn, both of which were removed.

## Consequences

- **No async version resolution on the load path.** Version state changes only
  in response to explicit user actions (load, new, submit), never a debounced
  background fetch. A reviewer who sees a new effect that fetches or recomputes
  the version on `formId` change should treat it as a regression of #417.
- **Bump helpers live in `apps/form_builder/app/lib/version.ts`** (`bumpMinor`,
  `bumpPatch`), unit-tested in `version.spec.ts`. New bump semantics go here, not
  in a server endpoint.
- **The DB is never consulted to pick a version.** This is consistent with 0007:
  `form_definitions` is scratch, and the published truth lives in GitHub, which
  the picker merge already surfaces client-side. Reintroducing a server-side
  "next version" query would re-open the flicker.
- **Save draft creates a new patch row by default.** Because the seeded version
  is a patch bump (never equal to `currentVersion`), the submit path takes the
  create branch. In-place `updateRecipe` remains reachable only if the author
  manually edits the version field back to the current version.
- **Deploy targets a fresh minor**, which also resolves the latent
  "redeploy collides with the existing `1.3.0.json`" problem for free.
