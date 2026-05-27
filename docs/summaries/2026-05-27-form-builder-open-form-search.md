# Form builder open-form modal — search/filter — Implementation Session

**Date:** 2026-05-27
**Branch:** `feat/form-builder-open-form-search`
**Issue:** [#233](https://github.com/govtech-bb/gov-bb/issues/233) — form_builder: search in the "Open Form" modal
**Plan:** `docs/plans/form-builder-open-form-search.md`

## Context

The "Open Form" modal lists every saved form as a flat scrolling list. As the
number of forms grows, scanning the list is the only way to find one. #233 asks
for a search input at the top of the modal that filters the list live on title
or form ID. This is the sibling of the already-shipped Add-Field picker search
(`2026-05-26-form-builder-field-picker-search.md`).

## What we did

**One worktree, direct single-file implementation** — scope was one component
and zero new CSS, so subagents/TDD scaffolding would have been pure overhead.

- `FormPicker` extended with `query` state and a copied `matches(query, ...fields)`
  helper (case-insensitive substring), identical to the one in `FieldPicker`.
- An autofocused `pickerSearch` input + `×` clear button renders below the
  "Open Form" header. `autoFocus` because finding a form is the modal's whole job.
- `forms` is filtered on `title` and `formId` before the rows map.
- Two empty states: the existing "No forms found." (zero forms exist) and a new
  "No forms match your search." (forms exist, none match the query).
- Reused the existing `.pickerSearch` / `.pickerSearchInput` / `.pickerSearchClear`
  classes in `builder.module.css` as-is — **no CSS changes**.

## Why we did it that way

- **Client-side filtering, no server/loader/type changes.** `FormPicker` already
  receives the full `forms` array as a prop (loaded by the route). The list is
  fully in memory, so a per-keystroke server round-trip would add latency and
  complexity for no gain at this list size.
- **Copied the `matches` helper rather than extracting a shared `<SearchBox>`.**
  Only two call sites (this and `FieldPicker`) and they differ enough — tabs +
  counts + cross-tab hint vs. a flat list — that a shared component would cost
  more than it saves. Revisit if a third search appears. (Captured in the plan's
  *Alternatives considered*; not ADR-worthy.)
- **No unit test, by deliberate choice.** `apps/form_builder/jest.config.ts` runs
  `testEnvironment: "node"` with `testRegex: .*\.spec\.ts$` (not `.tsx`) and has no
  CSS-module mapper — so the harness *cannot render React*, and importing
  `-form-picker.tsx` into a test would fail on the `styles` import. The repo's
  convention is to unit-test pure logic extracted into `.ts` files; the sibling
  `matches` in `FieldPicker` is itself inline and untested. Given the user chose to
  mirror `FieldPicker` exactly (helper inline, no new file), verification here is
  build + existing suites + a manual browser smoke. Considered and rejected:
  extracting `matches` to a tested `.ts` module — small real coverage win, but it
  deviates from "mirror FieldPicker / one file" and would leave a second inline
  copy in `FieldPicker` unless that too were migrated.

## Base-branch note

Branched the worktree off `sandbox` (the merge target), **not** the repo's default
`dev`. The native `EnterWorktree` default (`worktree.baseRef: fresh`) would have
branched from `origin/dev`, but `sandbox` is ~21 commits ahead of `origin/dev` and
carries the form_builder state this work assumes. Created the worktree explicitly
off `sandbox` with `git worktree add … sandbox`, then entered it via path.

## Verify

- `pnpm exec nx run-many -t build` (excl. `landing`, whose prebuild needs network):
  12 projects compile.
- `pnpm exec nx run-many -t test`: 11 projects; `form-builder-app` 7 suites / 116
  tests pass.
- Manual browser smoke confirmed by the user (per standing preference — real
  browser over automated drivers): autofocus, live title/formId filtering, clear
  button, no-match message, and row selection all behave.

## Open questions

None.
