# Pin a stable dnd-kit id on the step editor's DndContext

## Context

Implemented from `docs/plans/546-dnd-kit-ssr-hydration-stable-id.md` on worktree
branch `worktree-dnd-kit-stable-id-546` (merges into `sandbox`). Issue
[#546](https://github.com/govtech-bb/gov-bb/issues/546).

The issue reported a React hydration-mismatch warning from dnd-kit
(`aria-describedby="DndDescribedBy-0"` server vs `DndDescribedBy-2` client) in
the `/builder` step editor.

## What we did

- **`apps/form_builder/.../-step-editor.tsx`** — added `id="step-fields-dnd"` to
  the single `DndContext` (the field-reordering list).
- **`-step-editor.spec.tsx`** — added a regression test that renders a step with
  one field and asserts the draggable handle's `aria-describedby` is the stable
  `step-fields-dnd`, not a counter-derived value.

## Why we did it that way

- **Root cause.** dnd-kit's `useUniqueId` (`@dnd-kit/utilities@3.2.2`) mints ids
  from a **module-global counter**, not React's `useId`. The id therefore
  depends on how many `DndContext`s have mounted in that JS context, so a server
  render and a client render can disagree → the reported mismatch.
- **The escape hatch.** `useUniqueId(prefix, value)` returns `value` verbatim
  when one is provided. Passing `id="step-fields-dnd"` to `DndContext` makes the
  draggable `aria-describedby` exactly `step-fields-dnd` on every render — proven
  by the test, which saw `DndDescribedBy-1` before the fix and the stable id
  after.
- **It doesn't reproduce today — fixed anyway.** Per the code trace in the plan,
  the step editor (and its `DndContext`) only mounts client-side: the builder
  loader starts with no selected step, so the editor never renders during SSR,
  so there's no server markup to mismatch against. The fix is a zero-risk,
  one-line guard against any future change that pushes the editor into SSR
  (e.g. pre-loading a form in the loader, or auto-opening the first step).
- **Rejected alternatives** — closing as not-applicable (accurate but leaves the
  latent footgun) and gating the sortable list to client-only render (more code,
  defeats SSR for that subtree, unnecessary given the escape hatch).

## Open questions

None. Live-browser confirmation was deliberately skipped in favour of the code
trace + defensive fix (user decision).
