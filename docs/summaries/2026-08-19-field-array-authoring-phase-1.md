# Session summary — fieldArray becomes a first-class authoring tool, Phase 1 (#2317)

**Date:** 2026-08-19 · **Branch:** `2317-field-array-phase-1` (off `main`) ·
part of #2317 (Phase 2 pending) · ADR 0067

## What shipped

The Form Builder's Field Array behaviour — previously a bare Min/Max stub that
seeded `{min: 0, max: 0}` and made the field **render zero inputs** (it
silently vanished from the live form) — is now a safe, self-explanatory
authoring tool:

- Renamed "Answer more than once", params "Start with" (default 1, floor 1)
  and "Allow up to" (default 4, clamped ≥ min via the existing `atLeastParam`
  machinery from #771), plus an optional `"Add another" link text` param.
- `addAnotherLabel` added to `fieldArrayBehaviourSchema` (form-types) and
  honoured by the runtime Add link (`repeatable-field.tsx`), mirroring
  repeatable's #768 field. Byte-identical markup when absent.
- New `BehaviourTypeDescriptor.supportedHtmlTypes` (ADR 0067): the editor
  offers the behaviour **disabled with a reason** on field types the runtime
  can't repeat (everything except text/number/time/tel/email/textarea).
- An aria-hidden **"The applicant sees" miniature** in the behaviour row: the
  field's real label, one box per "Start with" (capped at 5, "…and N more"
  overflow), and the live link copy; the link line hides when min = max.

## Why it looks the way it does

- **The miniature instead of explanatory prose.** The author's real question
  is "Field Array or Repeatable step?" — a shape question a sentence can't
  answer. A live preview answers it by demonstration; a drafted
  "which do I want?" callout was cut for exactly that reason. It deliberately
  breaks the descriptor-driven uniformity of the editor: every other behaviour
  is a *rule* (statable as a sentence); this one is a *shape*.
- **`min` stays a render floor, never a validation rule** (user decision at
  planning). "Start with" says exactly what it does; nothing in
  form-validation reads fieldArray bounds, and the array path deliberately
  renders `withRequired: false`. Gap 7 of the issue collapsed into the
  authoring clamp.
- **Disabled-with-a-reason, not hidden** for unsupported field types — an
  absent option reads as a missing feature; a stated constraint teaches the
  rule (ADR 0067).
- **Copy renames are author-facing only.** The `fieldArray` type string,
  published recipes, and the runtime contract are untouched; no committed
  recipe uses fieldArray (only the forms master-contract fixture), so the new
  defaults break nothing published.
- **Custom link text renders verbatim, no hidden-label suffix** — the
  author's copy already names the thing ("Add another middle name");
  appending a visually-hidden "middle name" would double it for screen
  readers. Default keeps today's exact markup so e2e and a11y behaviour are
  unchanged.

## Verification

TDD throughout (16 new specs red-then-green): form-types 461, form-builder
181, form-builder-app 738, forms 834, all green; `nx run-many -t build
--exclude=landing` (20 projects) and repo `tsc -b` clean. Adversarial review
pass found 0 correctness/security/convention issues; its two accepted
follow-ups (miniature cap spec, keep-in-sync comment on the hint copy) landed
as `0ed36f55`. Isaiah smoke-tested the builder from the worktree against the
sandbox forms API (`API_BASE_URL=https://forms.api.sandbox.alpha.gov.bb`) and
approved the visuals.

## Phase 2 (not this branch)

Review-page array rendering (`Ann,Bee` → `Ann, Bee`, all-blank rows omitted),
runtime clamp for legacy `{0,0}` configs, and unlocking `fieldArray` in the AI
system prompt (a spec currently pins that the prompt never mentions it). Plan:
`docs/plans/2317-field-array-authoring-phase-2.md` (local, uncommitted).
