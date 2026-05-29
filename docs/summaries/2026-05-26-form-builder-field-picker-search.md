# Form builder field picker — search/filter — Implementation Session

**Date:** 2026-05-26
**Branch:** `feat/form-builder-field-picker-search`
**Issue:** [#195](https://github.com/govtech-bb/gov-bb/issues/195) — form_builder: search/filter in the Add Field picker
**Plan:** `docs/plans/form-builder-field-picker-search.md`

## Context

The Add Field picker lists every component, block, and custom field on three flat tabs. As the registry has grown, scrolling has become the primary way to find anything. #195 asks for a search input above the tab strip that filters all three lists in real time.

The plan called for a single search input with `query` state alongside the existing `activeTab` state, substring + case-insensitive matching against each item's user-visible label and its `ref`/`fieldId`, count badges in tab labels, and a cross-tab hint when the active tab has no matches but another tab does. No new dependencies (the lists are short enough that `String.includes` is fine; fuzzy-search libs would be overkill).

## What we did

**One worktree, direct implementation** — scope was a single component plus a handful of CSS rules, so a subagent would have added overhead without speedup.

- `FieldPicker` extended with `query` state, derived per-tab filtered arrays (`components`, `blocks`, `custom`), and a small `matches(query, ...fields)` helper.
- Search input gets a controlled value, a focus border in `--color-accent`, and a `×` clear button that shows only when the input is non-empty.
- Tab labels render the (filtered) count inline as `Components (N)` — chose this over a separate `.badge`-style variant since the inline form needed no new style class and reads cleanly.
- When the active tab's filtered count is zero but other tabs have matches, a hint row renders below the tabs: `No matches here — try Blocks (1) or Custom (3).` Each tab name in the hint is a button that switches `activeTab` — saves a click compared to the static "try X" text the plan described.
- CSS additions in `builder.module.css`: `.pickerSearch`, `.pickerSearchInput`, `.pickerSearchClear`, `.pickerHintLink`. All token-driven (`--color-border`, `--color-accent`, `--color-text-muted`, `--color-surface`).

## Base-branch / rebase note

First implementation landed on a branch based on `origin/sandbox`. `sandbox` had drifted past what the plan assumed: it carried a 4-tab `FieldPicker` (with a `Primitives` tab reading from `catalog.components`) and Blocks moved to `catalog.blocks`. I adapted the implementation to that shape.

On review, the user pointed out that the real integration target is `feat/form-builder-save-draft-dev-iteration`, which carries the picker fix from `2cd11b9 fix(form_builder): field picker emits API-registered refs only`. That branch has the original 3-tab shape (Components from `REGISTRY_COMPONENTS`, Blocks from `REGISTRY_BLOCKS`, Custom from `catalog.custom`) — which is exactly what the plan was written against.

Rebased `feat/form-builder-field-picker-search` `--onto feat/form-builder-save-draft-dev-iteration f4bf85c`. The plan commit replayed cleanly; the implementation commit conflicted on `-field-picker.tsx` and was resolved by rewriting against the 3-tab shape (dropped `Primitives`, restored `Object.entries(REGISTRY_BLOCKS)` for Blocks). The CSS conflict auto-resolved.

Why this matters for future work: the picker shape on `sandbox` and on `feat/form-builder-save-draft-dev-iteration` is genuinely divergent — not a clean ancestor relationship. When `save-draft` lands on `dev` and `sandbox` reconciles, that catalog-vs-registry shape question (the one ADR 0008 settled) will need a follow-up alignment pass.

## Verify

- `pnpm exec tsc --noEmit` from `apps/form_builder`: clean for the two changed files. (Pre-existing errors on the base in `ai-builder/sessions.ts`, `server/registry.ts`, `ai/index.tsx` are unrelated.)
- Manual browser smoke test deferred to the user — per standing preference (smoke tests in the real browser over automated drivers).

## Out of scope (called out by the plan, still out)

- Keyboard navigation between matches (arrow keys, Enter to insert top match).
- Description/tag matching — `Primitive` and `Block` types don't carry those fields.
- Persisting query across navigations.
