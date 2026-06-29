# Form builder "Preview form" link → `?draft=` (not `?preview=`)

**Date:** 2026-06-25
**Branch:** `worktree-builder-draft-preview-link` → merges into `sandbox`
**Issue context:** loose end from Recipe visibility Phase 2 (#1682), under umbrella #1646

## What

The form builder's "Preview form" / "Preview saved form" links now emit
`?draft=<token>` instead of `?preview=<token>`. The one functional change is in
`apps/form_builder/app/lib/form-url.ts` (`joinFormPreviewUrl`); both rendered
links route through it, so no caller changed. Docstrings, the
`VITE_RECIPE_PREVIEW_TOKEN` note in `.env.example`, and three spec files were
updated to match.

## Why

Phase 2 (#1682) split what `?preview=` used to mean into two independent,
token-gated signals:

| URL param | Source served | Submission |
|-----------|---------------|------------|
| `?preview=` | **published** recipe (files/canonical) | **allowed** |
| `?draft=` | **DB scratch** (the builder's in-progress draft) | blocked |

The builder's link is meant to let an author view their *unpublished, in-progress*
work — which is now the `?draft=` path. But the builder was never updated when
#1682 landed: it kept appending `?preview=`, which after the split serves the
**published** recipe and is fully submittable. So an author clicking "Preview
form" was previewing the wrong source (the last published version, not their
current edits) — and on a brand-new/unpublished form, the published path doesn't
exist.

The forms app already forwards `?draft=` → `X-Recipe-Draft` (#1682, merged on
sandbox); this change just makes the builder generate the link that path expects.

## Notes

- Function names (`formPreviewUrl` / `joinFormPreviewUrl`) and the UI label
  "Preview form" were left as-is — they describe the action, and renaming would
  ripple into three callers for no behavioral gain.
- No new ADR: this conforms to the existing token-split decision (#1682) and the
  visibility ADRs (0011/0013); it doesn't establish a new principle.
- Verified via `form-builder-app:test` (641 pass), `form-builder-app:build`, and
  `tsc -b` (clean).
