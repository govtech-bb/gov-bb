# 0057 — Recipe versioning removed; one flat file per form

**Date:** 2026-06-23
**Status:** Accepted
**Issue:** [#1196](https://github.com/govtech-bb/gov-bb/issues/1196)
**Supersedes:**
[0019](0019-builder-version-bumps-are-client-side-and-deterministic.md),
[0041 — recipe versions are immutable and deploy claims are reserved](0041-recipe-versions-are-immutable-and-deploy-claims-are-reserved.md)
**Amends:** [0007](0007-runtime-recipes-load-from-files-not-form_definitions-table.md)

## Context

Every recipe edit used to be a version event. A form was a directory of
immutable SemVer files (`recipes/{formId}/{version}.json`); publishing minted a
new file, and a web of machinery existed to keep versions consistent: client-side
bump helpers (0019), a CI immutability guard plus DB deploy-claim reservation
(0041), a `UNIQUE(form_id, version)` scratch table, and a `version`/`formVersion`
pin threaded through submissions, drafts, payment webhooks, email rendering and
file uploads.

The only thing versioning bought us that git does not is a **runtime pin**:
three post-create paths (payment webhook, confirmation email, draft→submission)
re-resolve a stored item's recipe by the version it was created against. Git
already provides the human-facing version history — the per-form directory, the
immutability guard, the deploy-claim race protection, and the client bump logic
were all solving problems that "the file *is* the recipe, the PR diff *is* the
change" solves for free.

## Decision

**Each form is a single mutable file `recipes/{formId}.json`. Publishing
overwrites it; the PR diff is the record of change. The in-app SemVer machinery
is removed.**

- **Serving.** The loader prefers the flat `{formId}.json` (canonical). Legacy
  `{formId}/{version}.json` files load into a separate read-only fallback map
  used only when a stored item still pins a version.
- **Publishing.** The builder overwrites the flat file (fetch SHA → update in
  place) on branch `form-builder/{formId}-{ts}`. No version gate, no deploy
  claim, no cross-PR collision check.
- **Builder draft scratch.** `form_definitions` collapses to **one row per
  form** (`UNIQUE(formId)`, migration M2). The row is "the current draft"; the
  published artifact is the committed file. Preview reads the DB draft row if
  present, else the canonical file (no more highest-semver union). After a
  merge-archive deletes the row, the builder reseeds the draft from the file.
- **Runtime pins.** `formVersion` is optional everywhere and written `null` on
  new submissions/drafts (`null` → canonical). In-flight items created before
  cutover still carry a version and resolve via the legacy fallback until they
  age out.
- **Email contract cache key → `formId`** (was `formId:version`). With no
  per-version contract to disambiguate, the canonical recipe is the cache unit.
- **CI.** `recipe-version-guard` is deleted (immutability inverts — recipes are
  now edited in place and reviewed by diff). `validate-recipes` globs the flat
  files. `archive-merged-drafts` keys on `formId` and matches Added **or
  Modified** flat files (a re-publish modifies, it no longer adds).

## Two-phase retire

Removing the runtime pin atomically would break in-flight items at cutover, so
the retire is staged:

- **Phase 1 (shipped, PR A + PR B / #1622, #1630).** Stop *generating* versions;
  serve flat files; keep the legacy `{formId}/{version}.json` directories as a
  read-only fallback so already-created pinned items still resolve.
- **Phase 2 (PR C).** Delete the legacy directories, the loader's versioned map,
  `loadLegacyVersion`, `latestVersion`, and the `version?` threading through the
  read-back paths (loader, `findByFormId`/`getRecipe`, submission pipeline,
  payment webhook, email builder, files service). The `findByFormId({ version })`
  fallback no longer exists — a form resolves to its one canonical recipe.
  **Time-gated:** PR C is authored ahead of time but MUST NOT merge until the
  cutover (Phase 1) has been promoted to prod and the trigger below is met —
  otherwise the fallback is removed while in-flight pinned items still need it.

### Phase 2 trigger

PR C is safe once no *active* row still depends on a pinned version:

- `form_submissions`: zero rows with `form_version IS NOT NULL` in a
  pre-`fireDownstream` state (e.g. `PENDING_PAYMENT`), and the SQS DLQ drained.
- `form_drafts`: all `form_version IS NOT NULL` rows past their TTL.
- Conservative fallback: wait ≥ `max(draft TTL, payment-session expiry, SQS DLQ
  retention)` from the PR B prod deploy. **Record the concrete values here when
  the prod deploy lands** (Stage 0 Task 0.3): draft TTL = _TBD_, EzPay
  payment-session expiry = _TBD_, SQS DLQ `MessageRetentionPeriod` = _TBD_.

The `form_version` (submissions/drafts) and `version` (form_definitions) columns
stay as never-read audit breadcrumbs — PR C stops writing meaningful values
(drafts write `null`) but does not drop the columns. No M3 migration.

## Migrations

- **M1** (PR A) — `form_version` nullable on `form_submissions` / `form_drafts`.
- **M2** (PR B) — dedup `form_definitions` keeping the highest-semver row per
  `formId` (semver-aware: `string_to_array(version,'.')::int[]`, **not** text
  max — `1.10.0` > `1.9.0`), drop `UNIQUE(form_id, version)`, add
  `UNIQUE(form_id)`, drop `NOT NULL` on `version`.

**Rollback coupling:** a `git revert` of PR B restores the versioned loader and
removes the flat files; the legacy directories make versioned resolution work
immediately. A PR B rollback **must also run M2's `down()`** to restore
`UNIQUE(formId, version)` — otherwise the reverted builder's per-save version row
violates `UNIQUE(formId)`. Before deploying M2, run the per-environment dedup
audit (`SELECT form_id, count(*) FROM form_definitions GROUP BY form_id HAVING
count(*) > 1`).

## Consequences

- The PR diff is the recipe's changelog; reviewers read the diff, not a version
  bump. Git is the version history.
- Payment is untouched and doubly safe: `form_config` is keyed by `formId` only
  (0034/ADR boundary) and the charged amount is snapshotted onto
  `Payment.expectedAmount` at submit, never re-read from the recipe.
- A reviewer who sees a new client-side version bump, a `recipe-version-guard`
  reintroduction, or a `UNIQUE(form_id, version)` constraint should treat it as a
  regression of this decision.
- Obsoletes #826 (deploy-gate smoke for pinned versions); close it with PR C.
