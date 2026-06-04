# 0008 — Form builder catalog aligns with the API hydration registry

**Date:** 2026-05-26
**Status:** Accepted

## Context

When verifying the `RECIPE_SOURCE=both` save-draft dev loop introduced by
[#153](https://github.com/govtech-bb/gov-bb/issues/153), every draft saved via
`/builder/ui` 500'd on `GET /form-definitions/{formId}`. The underlying
exception was `UnresolvableComponentError: Unknown component ref:
components/text` — the hydrator (`apps/api/src/registry/resolution.ts`) could
not resolve the refs the builder had emitted.

The form builder's field picker had three tabs that could add a field to a
recipe:

- **Primitives** — sourced from `packages/form-builder/src/builtins/`, which
  advertised generic refs like `components/text`, `components/number`,
  `components/textarea`, `blocks/name`.
- **Components** — sourced from `@govtech-bb/registry`'s
  `REGISTRY_COMPONENTS`, which is kept in sync with the API's
  `BUILTIN_REGISTRY` (`apps/api/src/registry/builtins/`). This tab advertised
  domain-specific refs like `components/first-name`, `components/email`,
  `blocks/personal-information`.
- **Blocks** — sourced from the same in-package builtins as Primitives, so
  same problem.

The two sources had drifted: the API's registry is entirely domain-specific
(`FirstName`, `EmailAddress`, `DateOfBirth`, ...), with no generic `text` /
`number` primitives. The form-builder package's builtins predated that shape
and still listed generic primitives that no API surface had ever registered.

`apps/form_builder_api`'s POST `/builder/forms` saves a recipe without
validating refs against the API registry. So a draft built from the
Primitives tab persisted happily — and only blew up on hydration during the
GET round-trip.

We considered three responses (option list during planning):

- **(a) Translate `UnresolvableComponentError` to a 422 in
  `FormDefinitionsService.findByFormId`.** Smaller diff, but the draft is
  still unusable — the user just sees a readable error instead of 500.
  Rejected.
- **(b) Add generic primitive components (`text`, `number`, ...) to the API
  registry so the form-builder package's existing builtins resolve.**
  Increases API surface area for fields that have no domain semantics; the
  existing registry is intentionally semantic. Rejected as the wrong
  direction.
- **(c) Make the form builder's catalog a strict subset of the API's
  registry.** Chosen.

## Decision

**The form builder catalog (what the field picker offers a user) is a subset
of the API hydration registry. Any ref the builder can emit must be one the
API can resolve.** `@govtech-bb/registry` is the single source of truth for
what refs exist; the form builder reads from it.

Corollaries:

- **Field picker reads `@govtech-bb/registry`.** The `Components` and
  `Blocks` tabs in `apps/form_builder/app/routes/builder/ui/-field-picker.tsx`
  iterate `REGISTRY_COMPONENTS` and `REGISTRY_BLOCKS`. The legacy
  `Primitives` tab — which sourced from
  `packages/form-builder/src/builtins/` — is removed.
- **Display-name lookup falls back to the registry.**
  `getRegistryItem` in `packages/form-builder/src/catalog.ts` first checks
  the in-package builtins (kept for the form-builder package's own spec
  tests), then `REGISTRY_COMPONENTS` / `REGISTRY_BLOCKS`. So
  `-step-editor.tsx` renders friendly labels for registry-keyed refs.
- **`packages/form-builder/src/builtins/` is now legacy.** It remains
  referenced by the form-builder package's existing spec suite (which is
  fixture-heavy and relies on those refs). It is no longer reachable from
  the UI. A follow-up can retire it once the specs are migrated to
  registry-backed fixtures.

## Consequences

- **Adding a new component or block.** Add it to `@govtech-bb/registry`
  *and* to `apps/api/src/registry/builtins/` — the existing "keep in sync"
  comment at the top of `packages/registry/src/components/index.ts` already
  enforces this with a `Block[]` length-typed compile-time guard. The form
  builder picks it up automatically through the registry import.

  > **Superseded in part by [0018](0018-registry-is-sole-home-for-builtin-definitions.md).**
  > `apps/api/src/registry/builtins/` has since been deleted; builtin
  > definitions now live only in `@govtech-bb/registry`. Add a new component
  > or block there only. The rest of this record — the form builder catalog
  > being a subset of the registry — still holds.
- **Adding it to the form-builder package's builtins is no longer
  required.** Those files are inert as far as the running UI is concerned.
- **Enforcement is still aspirational at the save boundary.**
  `apps/form_builder_api/src/routes/forms.ts` does not validate refs
  against the registry on POST `/builder/forms`. A draft constructed
  outside the UI (curl, JSON paste, ai assistant) can still persist with
  unresolvable refs and 500 on hydration. Follow-up: server-side ref
  validation at save time. Tracked separately.
- **Existing drafts created before this change are broken.** Anything in
  `form_definitions` that uses `components/text` and friends will 500 on
  hydration. Delete those rows or rewrite the schemas through the new
  picker. There is no migration step planned — the affected drafts are
  dev-only.
- **Tests.** Form-builder package specs are unchanged; they still exercise
  the in-package builtins. UI-level tests on the field picker should
  assert behavior against `REGISTRY_COMPONENTS` / `REGISTRY_BLOCKS`, not
  the in-package builtin lists.
