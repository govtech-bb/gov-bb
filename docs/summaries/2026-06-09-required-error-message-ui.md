# Restore custom "Required" error message in the form builder UI (#1022)

## Context

The form builder offered no way to author a **custom error message for the
`required` validation rule** — the message always fell back to the runtime
default ([#1022](https://github.com/govtech-bb/gov-bb/issues/1022)). This was
unintended fallout from [#618](https://github.com/govtech-bb/gov-bb/issues/618),
not a deliberate removal. #618 fixed a genuine *double-control* problem
(`required` was editable both via the dedicated checkbox and via the generic
`ValidationRulesEditor`'s per-rule "Error Message" input) by excluding
`required` from the rules editor — making the checkbox its sole owner. But the
checkbox only ever wrote the boolean (`{ value: true }`) and was never given an
error-message input, so `required.error` became unreachable from the UI.

The data model (`{ value, error? }` in `packages/form-types`) and runtime
(`config.error ?? DEFAULT_MSG` in `packages/form-validation/src/rules/required.ts`)
already supported it, and both hydrators merge validations identically (ADR
0021) — so this was a **UI-only fix**. Resolved on
`required-error-message-ui` (targets `sandbox`).

## What we did

- **`apps/form_builder/app/routes/builder/-field-edit-panel.tsx`** — added a
  conditional "Required error message" text input directly below the Required
  checkbox in `OverrideForm`. Rendered **only when the field is effectively
  required** (same `isRequiredRule(override) ?? defaultRequired` computation the
  checkbox uses). Value is `overrides.validations?.required?.error ?? ""`;
  placeholder is the inherited hint `baseValidations?.required?.error ??
  DEFAULT_REQUIRED_MSG`. Override-highlighted via `fg(...required?.error !==
  undefined)`, matching sibling controls.
- **`-field-edit-panel.spec.tsx`** — six new cases covering all three write
  branches plus visibility and placeholder/value wiring.

## Why we did it that way

- **The override must carry both keys (`{ value: true, error }`), never a bare
  `{ error }`.** `shallowMergeDefined` (`packages/form-types/src/merge.ts`)
  merges validations **shallow at the rule level** — an override of `required`
  replaces the whole rule object. Writing `{ error }` alone would drop `value`
  and silently un-require the field. This constraint drives the entire write
  logic.
- **Three-state clear behaviour mirrors the checkbox.** On empty input: if the
  base already requires the field (`defaultRequired`), `delete next.required` to
  restore inheritance rather than persist a redundant rule; otherwise the field
  is required only because the override says so, so keep a bare `{ value: true }`
  to avoid un-requiring it. Both branches are tested (base-required → undefined;
  base-optional → `{ value: true }`).
- **Kept `required` owned by this single control — did NOT re-add it to
  `ValidationRulesEditor`.** That would directly recreate the #618
  double-control the exclusion was added to prevent. A deep-merge alternative
  (so `{ error }` alone would be safe) was rejected too: it changes shared
  resolution semantics across both hydrators (ADR 0021) for a UI gap — higher
  blast radius, out of scope.
- **Input wrapped in its `<label>` rather than `id`/`htmlFor`.** The block
  path renders `OverrideForm` once per child element, so a static `id` would
  collide across siblings. An implicit-label wrap scopes each input to its own
  label and matches the file's existing checkbox convention.

## Open questions

- None blocking. The only nuance — "clearing restores inheritance vs keeps
  `{ value: true }`" — is settled and tested. Manual in-browser confirmation
  (mark required → input appears → type → preview renders the custom message on
  empty submit) is left to the author per the repo's preference for real-browser
  smoke over Playwright.
