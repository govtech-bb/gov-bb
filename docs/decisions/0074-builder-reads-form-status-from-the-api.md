# 0074 — The Form Builder reads a form's status from the API and never derives it from the recipe or manifest

**Date:** 2026-10-03
**Status:** Accepted
**Related:** [#2875](https://github.com/govtech-bb/gov-bb/issues/2875) (this
decision), [#1650](https://github.com/govtech-bb/gov-bb/issues/1650) (epic:
feature-flagging on `service_status`), [#1835](https://github.com/govtech-bb/gov-bb/issues/1835)
(picker lists non-public forms via `RECIPE_PREVIEW_TOKEN`),
[#2683](https://github.com/govtech-bb/gov-bb/issues/2683) (stop writing manifest
visibility into the recipe), ADR 0059 (amended by this ADR), ADR 0063 (the
"row overrides seed" rule this ADR consumes), ADR 0015 (builder list views
reach apps/api through form_builder_api)

## Context

A form's launch status is owned by the `service_status` table: an admin sets it
in `apps/feature_flagging`, and apps/api applies it as
`effectiveVisibility(recipeVisibility, statusRow)` — the row wins, the recipe's
`meta.visibility` is the fallback only when a form has no row (ADR 0063).

The Form Builder still read the *seed* in several places and called it the
status: the editor toolbar showed `getRecipeVisibility(draft)` behind a
Visibility select that wrote `meta.visibility`; Deploy was blocked while that
seed was `draft`; the dev-only local list stamped `recipe.meta.visibility`; the
services workbench showed and offered the manifest's `visibility`, which
`checkpointFiles` then wrote into every page's frontmatter and the recipe. A
form toggled `disabled` in Feature flagging therefore still read "Public" in the
builder, and an author could "change" a status that nothing downstream honoured.

Meanwhile the builder already *had* the right value: form_builder_api's
`GET /builder/forms/published` proxies apps/api's `GET /form-definitions` with
`x-recipe-preview`, and that authoring list stamps each form's effective
visibility, which `listForms` carried onto `BuilderFormSummary.visibility` for
the picker badge (#1835). Only that one badge used it. The proxy was also
fail-open: with no `RECIPE_PREVIEW_TOKEN` it silently served the public-only
list, which carries no visibility at all.

## Decision

**The builder shows a form's status from apps/api's effective visibility and
nowhere else. It offers no control to change it.**

- `BuilderFormSummary.visibility` is the single carrier: the value apps/api
  stamped on the authoring published index (row wins, recipe fallback). Every
  builder surface — picker badge, editor toolbar, Deploy flow, service library,
  service workbench — reads that field via `lib/form-status.ts`.
- The builder never evaluates `meta.visibility` on a recipe it holds, nor a
  manifest's `visibility`, to decide what to show or whether to deploy. The
  Visibility select, `SET_VISIBILITY`, the `draft` Deploy gate, and the
  manifest's Release select and readiness issue are removed.
- `undefined` on a *published* form means the authoring list was unavailable
  (the proxy fell back to the public-only index) and renders as
  "Status unavailable" — never as `public`. An *unpublished* form has no live
  status ("Not published"); a failed forms-list fetch is "Status unavailable".
- `RECIPE_PREVIEW_TOKEN` is required at boot in production for
  form_builder_api, alongside `ADMIN_API_TOKEN` and `GITHUB_ORG`. Outside
  production the proxy warns once and the UI shows the degraded state.
- The pointer to where status *is* changed is plain text ("Set in the Feature
  flagging tool."); the builder carries no per-environment URL.

The write side is deliberately untouched. New recipes still seed
`meta: { visibility: "draft" }` (safe-by-default under ADR 0063's no-row
fallback), ADR 0059's hydration still carries a committed `meta` through a
Deploy, and the AI prompt's rule still applies. Stripping the field or changing
what is written is only safe once apps/api no longer falls back to the seed.

## Consequences

- With a `service_status` row, editing `meta.visibility` in a recipe changes
  nothing the builder shows. With no row, the builder shows what apps/api
  shows — the recipe value — because apps/api computed it, not the builder.
- Deploy is no longer gated on status. A new form deploys hidden (`draft` seed,
  no row) until an admin enables it in Feature flagging; the builder cannot
  raise a form to public.
- The manifest's `visibility` field remains in the schema only because
  `checkpointFiles` still writes it; #2683 stops that write. Until then a
  service Publish seeds `draft` into page frontmatter and the recipe, which the
  service's status row overrides on the live site.
- Content-only services (no form) keep deriving their library badge from page
  frontmatter — that is the content editor's own field, outside this decision.
- ADR 0059 is amended: its hydration is a *carry* mechanism for Deploy, no
  longer a display concern. ADR 0063's "future consumers must apply the row
  overrides seed rule" is satisfied by consuming apps/api's result rather than
  re-implementing the mapping in a third place.
