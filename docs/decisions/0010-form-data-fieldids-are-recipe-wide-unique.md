# 0010 — Form data fieldIds are recipe-wide unique

**Date:** 2026-05-26
**Status:** Accepted
**Related:** [#206](https://github.com/govtech-bb/gov-bb/issues/206), follow-up to [#201](https://github.com/govtech-bb/gov-bb/issues/201); backstop tracked in [#207](https://github.com/govtech-bb/gov-bb/issues/207), [#208](https://github.com/govtech-bb/gov-bb/issues/208). Builds on [0009](0009-form-builder-instance-ids-are-editor-only.md).

## Context

A submitted form's data is one flat object keyed by `fieldId`. Two elements that
resolve to the same `fieldId` therefore collide in submission data and silently
break every downstream reference to that id — validation rules, behaviours, and
the forms renderer.

A field's **effective** data id is `overrides.fieldId ?? primitive.fieldId`:
every catalog component ships a default `fieldId` (`components/text` → `"text"`),
and blocks expand to several child ids (`blocks/name` → `first-name`,
`last-name`), each overridable via `childOverrides`. The consequence is that the
most common collision needs no typing at all — dropping two Text fields makes
both resolve to `text` with blank overrides.

#201 added kebab-case *format* validation for ids but deferred *uniqueness*.
A format-only or override-only check (inspecting what the author typed) misses
the dominant blank-override collision.

## Decision

Within one recipe, every element's **resolved effective `fieldId`** must be
unique across the **entire form**, not per step, and every `stepId` must be
unique across the form. Uniqueness is checked on resolved ids (override or
catalog default, with blocks expanded), never on the raw override input.

The form-builder client is the source of truth for this check today:
`packages/form-builder/src/duplicate-ids.ts` is the single detector, and the
builder UI consumes it as a live gate (`canSubmit`), an always-on banner, the
Validate panel, and inline at-edit warnings. A duplicate blocks both Save draft
and Deploy.

This mirrors the AI-builder system prompt's existing rule ("EVERY element MUST
have a fieldId override … unique across the entire form").

## Consequences

- **Recipe-wide, not per-step.** Any feature that generates, edits, imports, or
  migrates ids must keep them unique across all steps. Per-step uniqueness is
  insufficient and must not be assumed.
- **Resolve before checking.** Uniqueness logic must operate on resolved
  effective ids (defaults + overrides + block-child expansion), not on the
  override fields alone. New consumers should reuse the `duplicate-ids` detector
  rather than re-deriving resolution.
- **Server backstop is deferred, not optional** (#207). `validateFormContract`
  is a pure Zod parse with no catalog, so it cannot resolve defaults today; the
  AI-builder path's only current guard is a prompt instruction. A shared
  detector wired into `/builder/registry/validate` should backstop AI output and
  any ingest. Until then, do not treat server-accepted recipes as
  uniqueness-checked.
- **Missing defaults are tolerated** (#208). A component whose primitive carries
  no resolvable `fieldId` and no override contributes no id and is skipped, not
  treated as a collision. Confirm custom components carry a resolvable default if
  they must participate.
