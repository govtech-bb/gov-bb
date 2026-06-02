# Migrate `components/generic/*` DB refs to registry `generic-*` primitives (#416)

## Context

39 forms referenced slash-namespaced `components/generic/*` components that
resolve **only** from the `custom_components` DB table — a standing DB/recipe
drift risk. The plan (`docs/plans/migrate-generic-db-components-to-registry.md`)
repoints the 11 types that have a registry equivalent to the `generic-*` source
primitives, leaving 5 orphans (`table`, `signature`, `repeater`, `display`,
`info-box`) on the DB. It depends on #415 (rename registry `raw-*` →
`generic-*`).

## What we did

- Repointed the 11 mappable slash refs across **49 recipe JSONs** to their
  registry equivalents (`generic-radio/number/checkbox/textarea/text/date/file`,
  plus `show-hide`). Left the 5 orphan slash refs untouched.
- Updated the AI-builder system prompt
  (`apps/form_builder/.../prompts/system-prompt.ts`) — the two refs it names
  (`generic/radio`, `generic/number`) repointed, "custom DB component" wording
  corrected to "registry primitive".
- Added `apps/api/.../recipe-registry-refs.spec.ts` — a CI guard.

## Why we did it that way

- **Based on `feat/registry-generic-rename-redo`, not `dev`/`sandbox`.** #415
  landed (PR #419) then was **reverted** (PR #421), so `generic-*` refs don't
  exist on the mainline — repointing there would make every touched form fail to
  hydrate. Isaiah pointed us at the redo branch, which re-applies the rename.
  This branch must therefore merge into the redo branch, or land only *after*
  #415 re-lands. The plan's documented fallback (target the live `raw-*` names
  now, rename later) was explicitly declined.
- **Exact quoted-string substitution, trailing quote included.** All 470
  occurrences were clean `"ref": "components/generic/X"` strings. Matching the
  closing quote sidesteps the prefix hazard where `components/generic/text` is a
  prefix of `text-input`/`text-field` — a naive replace would have corrupted the
  longer refs.
- **Added a guard test instead of relying on "boot the API".** The plan assumed
  an unknown ref crashes the API in `onModuleInit`. It doesn't: the recipe
  *loader* only validates schema/formId (and logs per-file errors rather than
  throwing). Ref *resolution* is lazy and happens at `hydrateForm` —
  per [0017](../decisions/0017-recipe-ref-resolution-fails-loud.md) it fails
  loud there (`UnresolvableComponentError` in prod, `UnknownRefError` in
  preview), but only when that form is actually hydrated, which CI build/test
  never triggers. The guard asserts every `components/generic-*`/`show-hide`
  recipe ref is a key in `BUILTIN_REGISTRY` (the first thing `resolve()` checks,
  per [0018](../decisions/0018-registry-is-sole-home-for-builtin-definitions.md))
  and that no migrated slash ref reappears — catching typos, registry drift, and
  regressions at CI time. A membership check, not a full resolver invocation, so
  it stays cheap and doesn't pull NestJS DI into the test.
- **Accepted the primitives' `required: true` default.** Per the plan this is
  intended ("required by default is how it should be originally"); per-instance
  `overrides` fill `options` and any per-field needs. No extraction of the old
  DB definitions was needed.

## Open questions

- **Preview spot-check pending** — needs a real browser; delegated to Isaiah.
  Repointed forms should now resolve from the builtin catalog where they
  previously couldn't (the preview catalog ships `custom: []`).
- **Orphan cleanup deferred** — the now-redundant `custom_components` rows for
  the 11 repointed types stay until no recipe references them (DB-hygiene step).
- Authoring registry source for the 5 orphan types remains out of scope.
