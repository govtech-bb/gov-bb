# Decompose form_builder builder-route complexity hotspots (#1420, Phases 1–3)

**Date:** 2026-07-01
**Branch:** `1420-form-builder-complexity-decomp` → `sandbox`
**Issue:** [#1420](https://github.com/govtech-bb/gov-bb/issues/1420) [TECH-03]

## What

Pure, behaviour-preserving decomposition of three flagged builder-route editors,
one commit per phase:

- **Phase 1 — `-field-edit-panel.tsx` / `OverrideForm`:** extracted inline
  sub-components `FieldIdOverrideInput`, `RequiredRuleEditor`, `OptionsSection`,
  `PlainOverrideFields`.
- **Phase 2 — `-contact-details-editor.tsx`:** extracted `useContactDetailsForm`
  and `useCreateMdaContactForm` into `-use-*.ts` hooks, the create card into a
  `NewMdaContactForm` component, and the mapping logic into pure helpers
  (`detailsToFields`, `buildContactDetails`, `formatIssues`).
- **Phase 3 — `-toolbar.tsx`:** extracted inline `ToolbarStatus`,
  `FormIdentityFields`, `ToolbarActions` and pure button-state helpers
  (`saveDraftDisabled`, `deployDisabled`, `deployTitle`).

Guarded throughout by the existing `*.spec.tsx` suites (30 / 12 / 24 tests) —
green before and after each phase; full `form-builder-app` suite 661/661,
`tsc -b` clean, `nx run form-builder-app:build` clean.

## Why it looks the way it does

**Inline sub-components vs. new files.** Hooks became separate `-use-*.ts` files
(the strong existing convention: `useMdaContacts`/`useFormsList`/`usePresence`).
Child components stayed *inline* in their editor file, following the
`UiPropertiesEditor` precedent already in `-field-edit-panel.tsx` — this avoids
awkward cross-file imports of internal helpers (`isRequiredRule`, format
constants) and keeps each subtree next to its only caller.

**We extracted more than the plan literally named.** The plan named three units
for Phase 1 and two for Phase 3; the actual goal is getting each function under
fallow's thresholds (cyclomatic 20 / **cognitive 15** / crap 30). Clearing the
cognitive line needed a few extra cohesive extractions — `PlainOverrideFields`
(P1), the P2 pure helpers, and `ToolbarStatus` + the button helpers (P3).

**How fallow measures cognitive complexity shaped the work.** Two findings drove
the later extractions:

1. A hook's cognitive score rolls up its own body, including `useState`
   initializers. `useContactDetailsForm` sat 1 over threshold purely because of
   nine `useState(existing?.…?.… ?? "")` initializers; reusing `detailsToFields`
   to seed them once cleared it — not the `save`/`fill` handlers, which measured
   fine on their own.
2. Cognitive is heavily weighted by **prop count / JSX prop-drilling**.
   `Toolbar` ends at cc2 (no branching left) but cog20, tracking its 23-prop
   interface. That residual is *structural* — reducible only by reshaping
   Toolbar's contract, which touches its caller `builder/index.tsx`
   (`BuilderPage`), the explicitly-deferred Phase 5. So Phase 3 stops at
   critical→moderate for `Toolbar` and fully clears `FormIdentityFields` /
   `ToolbarActions`.

**Residual fallow flags are coverage, not complexity.** A few helpers
(`detailsToFields`, `RequiredRuleEditor`, `ToolbarStatus`) remain flagged for
`crap` only. Crap = `cc²·(1−cov)³ + cc`; with cc/cog under threshold and
coverage estimated statically, a pure refactor cannot move it — only tests can.
These are not complexity breaches.

**One behavioural subtlety preserved:** `useCreateMdaContactForm` is held by the
parent `ContactDetailsEditor`, not by `NewMdaContactForm`. Mounting it inside the
card would reset a half-typed create form on Cancel/reopen; the original state
lived in the parent and only reset after a successful create, so we kept it there.

## Notes / follow-ups

- Baseline was validated against `origin/sandbox` — the local `sandbox` checkout
  was 101 commits stale; the worktree was branched off the remote.
- Dropped a dead `version` prop the toolbar spec passed (leftover from #1196,
  never on `ToolbarProps`).
- The plan doc's fallow command (`-w 'apps/form_builder/**'`) is wrong — the flag
  matches workspace *names*: use `-w @govtech-bb/form-builder-app`. Its cognitive
  figures (67/119/140) and baseline test count (614) had also drifted (actual
  cog 32/38/50; 661 tests).
- Phases 4 & 5 (`content/edit.tsx` / `StartPagesEditor`, `builder/index.tsx` /
  `BuilderPage`) remain deferred until #1403 merges.
