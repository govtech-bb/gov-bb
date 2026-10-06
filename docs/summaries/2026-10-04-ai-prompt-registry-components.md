# AI prompt: document the components it omitted, and make the guard derive from the registry

2026-10-04 · `form_builder_api` · #2885, #2900 items 2–4

## Context

The system prompt's "Complete Component Reference" omitted `content`,
`address-lookup`, `opening-hours`, `generic-time` and
`generic-checkbox-accordion`, so the assistant could not author them. The guard
spec's `GENERIC_PRIMITIVES` was a hard-coded list of 10, so its "surfaces
every generic primitive" test passed despite the gap.

## What we did

- Documented the five components with their authorable keys in
  `system-prompt.ts`.
- `system-prompt.spec.ts` derives `GENERIC_PRIMITIVES` from
  `REGISTRY_PRIMITIVES` (`@govtech-bb/registry`, now a dependency of
  form_builder_api) and pins each new component's keys against form-types
  schemas.
- New `workspace-prompt.spec.ts`. Review hardening (`34ad1ba7`) anchored the key
  checks to the worked examples and read the generic-time default from the
  registry. Also dropped a dead `?? ""` in `preview-modal.tsx`
  and asserted the optional-contact copy in `service-setup.spec.tsx`.

## Why we did it that way

**The registry is the source, not another list.** The issue's whole problem was
that the hard-coded list drifted from the registry. Deriving it means the next
registry primitive fails the spec until the prompt documents it. A deletion of
the `generic-time` line confirmed the failure. The cost is a new workspace
dependency for form_builder_api, wired through `paths` because that app builds
with plain `tsc`, not the composite `@nx/js:tsc` executor.

**The spec checks keys against schemas, not copy.** Variant values come from
`contentVariantSchema.options`, and group keys from `optionGroupSchema.shape`,
so a schema change breaks the spec instead of letting the prompt go stale. The
geocode sub-keys are listed in the spec, typed as `keyof GeocodeTargets`,
rather than adding a barrel export just for a test. (The field-editor branch
for #2886 does export `geocodeTargetsSchema`. Whichever merges second could
switch to it.)

**`ui.hidden` was documented too.** It's outside the issue's list. The
address-lookup coordinates target is unauthorable without a hidden input, and
every real recipe uses `generic-text` + `"ui": {"hidden": true}`, so leaving
the `ui` section at "two optional keys" would have contradicted the new
bullet.

**The workspace-prompt spec checks against the tools themselves.** Tool names,
target keys, the create operation and the "set both or neither" rule are
checked against `@govtech-bb/form-builder`'s tool schemas, so renaming a tool
or loosening a rule fails the spec.

## Open questions

- The "Ask one question once" section still uses per-day opening hours as its
  worked example, which predates `components/opening-hours`.
- CATEGORY 0's list of generic primitives still names the original 10, and no
  CATEGORY 1 trigger rows (e.g. "time" → `generic-time`) were added.
