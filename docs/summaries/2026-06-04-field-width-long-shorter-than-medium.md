# 2026-06-04 — Why "Long" rendered shorter than "Medium" (#789)

## Context

A builder author set National ID number's field width to **Long** and it
rendered visibly *narrower* than **Medium**. The session started as a
"why is that?" investigation and ended as a two-resolver fix plus ADR 0037.

## What we did

- `a7ccd15f` — the edit panel's width fallback is now the component's
  registry `ui` value (threaded as `baseUi`, mirroring `baseValidations`),
  and the preview resolver deep-merges `ui` per-key.
- `83e00370` — the live API resolver
  (`apps/api/src/registry/resolution.ts`) gets the identical `mergeUi`,
  found in review *after* the first commit.
- ADR `0037-override-sub-objects-merge-per-key-against-registry-defaults.md`;
  follow-up issues #796 (dedupe the merge helpers) filed, #789 targeted.

## Why we did it that way

- The symptom only makes sense once you see that "select Long" persisted
  *nothing*: the panel collapsed any value equal to its hard-coded global
  default (`"long"`) to `undefined` per the ADR 0013/0014 override contract,
  and resolution then fell back to National ID's registry
  `ui: { width: "short" }`. Medium persisted explicitly (38ch); Long fell
  through to short (24ch).
- **Fix the baseline, not the registry.** The alternative — deleting
  `width: "short"` from the National ID component — also kills the symptom
  but changes the default rendering of every existing form, and the short
  default is *right* for a 10-digit value. So the panel's collapse baseline
  became per-component instead.
- **Keep collapse-to-undefined semantics.** We deliberately did not pin
  explicit values for every control; minimal overrides mean a field
  re-pointed at another component inherits the new component's defaults.
  The cost is that the editor must know the base primitive — acceptable,
  since `baseValidations` already established the threading pattern.
- The panel fix alone made the **served** form worse-looking by comparison:
  the API resolver still replaced `ui` wholesale (the exact bug #371 fixed
  for `validations` — its comment literally documents the class), so a
  hideLabel-only override dropped the registry width for citizens while the
  now-deep-merging preview looked correct. Pre-existing, but fixed here
  because preview/live disagreement is the worse failure mode.
- Boolean controls changed subtly with the baseline shift: unchecking now
  persists `false` only when the base default is `true` (previously `false`
  always dropped). Row highlight now means "overridden", not "checked".

## What we almost got wrong

- The first review framing claimed the builder "used to persist full `ui`
  objects" — false; partial `ui` overrides predate this session, so the API
  bug was latent all along, not introduced by the panel fix.
- Ref-swap carries partial `ui` verbatim, so an unset key silently adopts the
  *target* component's default after a swap. We judged that the correct
  semantics (deliberately untested for now) rather than a bug.

## Open questions

- #796: the four copies of `mergeValidations`/`mergeUi` across the two
  parallel resolvers want a shared `shallowMergeDefined` in
  `@govtech-bb/form-types` — exactly the duplication that let the resolvers
  drift twice.
