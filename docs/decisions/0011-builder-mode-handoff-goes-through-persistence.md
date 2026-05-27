# 0011 — Builder-mode handoff goes through persistence

**Date:** 2026-05-27
**Status:** Accepted
**Related:** [#235](https://github.com/govtech-bb/gov-bb/issues/235) — Form Builder AI: open generated form directly in the Form UI builder.

## Context

The Form Builder has two authoring modes: the AI chat (`/builder/ai`), which
generates a recipe, and the UI builder (`/builder/ui`), which edits a recipe as
a draft. Issue #235 adds an "Open in builder" action so a freshly generated form
can be edited in the UI builder in one click.

There were two ways to carry the form across the boundary:

1. **Persist, then re-open by `formId`.** Publish the recipe to
   `form_definitions`, then navigate to the UI builder pointed at that `formId`,
   which loads it via the same path the **Open** form picker already uses
   (`getRecipe` → `deserializeRecipe` → `handleLoad`).
2. **Carry the in-progress recipe client-side** (router state / sessionStorage),
   with no publish — lighter, and works before a form is persisted.

## Decision

Handing a form from one builder mode to another happens by **persisting it and
re-opening by `formId`**, never by carrying an in-progress recipe across the
client. The receiving mode always opens a *created* (persisted) form.

Concretely: "Open in builder" calls `publishSession`, reads the returned
`formId`, and navigates to `/builder/ui?formId=<id>`. The UI builder's one-shot
mount effect loads that id through the existing Open-picker code path. The
handoff token is a **search param** (`?formId=`), not router history state.

## Consequences

- **One recipe→draft load path.** The receiving mode reuses the Open-picker
  flow; there is no second "rehydrate an unpublished recipe" code path to keep in
  sync. New cross-mode entry points should publish-then-open, not invent client
  carry.
- **Open implies created.** A form reachable in the UI builder via handoff is
  always in `form_definitions`. Anyone wanting "Open in builder" to work on an
  *unpublished* draft is changing this principle and should supersede this record
  rather than bolting on transient client state.
- **Handoff is refresh-safe and shareable.** Because the token is `?formId=` and
  not history state, a reload or a copied URL re-opens the same form. The
  receiving route strips the param after loading so a refresh can't re-trigger
  the load or clobber edits.
- **Relies on publish idempotency.** `publishSession` is idempotent within a
  session (re-publish deletes the prior row and re-inserts), so "Open in builder"
  works whether or not "Publish" was already clicked. A handoff that published
  non-idempotently would duplicate forms.
