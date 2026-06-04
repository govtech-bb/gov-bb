# Expose `optionalIf` in the form builder's field modal (#769)

Date: 2026-06-04
Issue: [#769](https://github.com/govtech-bb/gov-bb/issues/769)
Branch: `worktree-optionalif-behaviour-modal-769` → `sandbox`

## Context

The `optionalIf` behaviour landed in #625 across all four runtime layers
(schema, shared evaluator, API validation, forms client) — but the builder
authoring UI was deliberately scoped out of that PR (named as a follow-up in
`2026-06-03-optionalif-conditional-required.md`). Meanwhile #761 catalogued ten
recipes that need `optionalIf` authored onto National ID fields, which made the
authoring gap concrete: a builder user could not add the behaviour the recipes
need. This session closed exactly that gap.

## What we did

- Added a field-scoped `optionalIf` entry to `BEHAVIOUR_TYPE_DESCRIPTORS`
  (`packages/form-builder/src/behaviors/behaviour-builder.ts`).
- Added four tests to `-behaviours-editor.spec.tsx`: dropdown offers it for
  field scope, hides it for step scope, seeds Target Step from `currentStepId`,
  and renders the gated/boolean controls for an existing behaviour.
- Filed [#770](https://github.com/govtech-bb/gov-bb/issues/770) (review
  finding): the AI system prompt documents only `fieldConditionalOn`, so the AI
  cannot author `optionalIf` (or any other behaviour).

One commit; the diff is 99 added lines, most of them tests.

## Why we did it that way

- **A descriptor, not editor code.** Exploration up front showed the behaviours
  editor is fully data-driven off `BEHAVIOUR_TYPE_DESCRIPTORS` — the #519
  step-gated field picker and the #565 boolean-aware value control key off
  param *kinds*, not behaviour types. Declaring `optionalIf` with the same
  param shape as `fieldConditionalOn` (Target Step → Target Field → Operator →
  Value, in that order — ordering drives the #519 gating) buys both behaviours
  for free. No alternative was seriously considered; adding per-type UI would
  have cut against the editor's whole design.
- **UI parity over multi-instance support.** The runtime ANDs multiple
  `optionalIf` behaviours, but the editor's "Add Behaviour" dropdown allows one
  behaviour per type per field — same constraint `fieldConditionalOn` already
  lives with. We kept parity rather than redesigning the one-per-type rule for
  all behaviours; user confirmed this scoping at session start.
- **No serialization/API work needed.** The builder API validates recipes via
  the shared `behaviourSchema` (which has included `optionalIf` since #625),
  and `registry.ts` emits `BEHAVIOUR_TYPE_DESCRIPTORS` wholesale — the new
  entry flows through automatically. Code review confirmed no other site
  enumerates behaviour types.
- **Component tests as the verification, no dev-server run.** The change is a
  single declarative descriptor consumed by already-tested generic rendering;
  the new specs render the real editor and drive the real user flow, which is
  the faithful test at this altitude.

## Open questions

- Whether the AI recipe generator should be able to author `optionalIf` (and
  the other undocumented behaviours) — deliberately split off as #770 rather
  than folded in here, since the prompt's behaviour subset looks curated.
- #761 (apply `optionalIf` to the ten passport-toggle recipes) remains open;
  this session built the tool, not the content.
