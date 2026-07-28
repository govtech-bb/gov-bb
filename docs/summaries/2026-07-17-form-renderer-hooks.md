# Session summary — Fix rules-of-hooks in form-renderer (#1981)

**Date:** 2026-07-17 · **Branch:** `fix-1981-form-renderer-hooks` (off `main`)

## What shipped

`FormRenderer` called ~6 hooks *after* an early `if (!currentStep) return null`
(line 211) — a rules-of-hooks violation (hook count could change between
renders). Fixed by **extracting the entire after-guard body into a new child
component `ActiveStep`** in the same file. `FormRenderer` keeps its top hooks +
the guard and renders `<ActiveStep currentStep={…} …/>`; every hook now lives in
`ActiveStep`, which only mounts once a step exists, so they run unconditionally.

## Why it looks the way it does

- **Child-component split, not null-safe guards.** Two ways to fix it: (1) move
  the body into a child that only mounts when `currentStep` exists, or (2) keep
  one component and make every hook/derived value null-safe (`?.` / `?? []`).
  Chose (1) because it's **the codebase's own pattern** — `routes/forms/$formId`
  already splits `RouteComponent → FormView` for exactly this reason — and it's
  behaviour-preserving *by construction* (the child can't run with a null step),
  whereas (2) sprinkles guards across many lines in the core renderer and is easy
  to get subtly wrong.

- **Top effects left in `FormRenderer`.** The 3 pre-guard effects already guard
  internally (`if (!currentStep?.…) return`) and are valid where they are;
  moving them would enlarge the diff for no behaviour gain.

- **`ActiveStepProps` typed off existing types**, not hand-written signatures:
  `currentStep: FormRendererProps["visibleSteps"][number]`, and the two callbacks
  via `ReturnType<typeof useStepGuard>["…"]`, so the child stays in lockstep with
  the guard hook and props.

## Coordination with #1976 (important)

The `rules-of-hooks: warn` override for this file lives on the **unmerged #1976
branch**, not on `main`. So it can't be removed on this branch, and the rule
isn't active here to gate against (verified instead with a throwaway react-hooks
config: 0 violations). Sequencing decision (option a): **land #1976 first**, then
this branch rebases on the updated `main` and the override removal is added in one
line. This branch must NOT merge before #1976 (otherwise #1976 would re-add a
now-pointless override on already-clean code). Unblocks #1991 (perf), which edits
the same hooks.

## Verification

forms tests green; react-hooks scan of `form-renderer.tsx` = 0 `rules-of-hooks`;
tsc clean for this change (the only 2 tsc errors are pre-existing stale
`@govtech-bb/form-types` declaration resolution in unrelated files). A manual walk
of the full form flow (steps, back, show/hide, repeatables, review, confirmation)
is recommended before merge given this is the core citizen renderer.
