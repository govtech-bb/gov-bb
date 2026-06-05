# Marital-status registry select component

## Context

Marital status appeared in three recipes as inline `components/generic-radio`
blocks with copy-pasted options. Issue #738 (staging-vs-live parity audit of
JobStart Plus) flagged the field type as wrong: live renders a dropdown
(`Single / Married / Divorced`), staging rendered radios. The session created a
dedicated `components/marital-status` select and pointed the latest version of
each affected recipe at it.

## What we did

- `packages/registry/src/components/marital-status.ts` — `SelectPrimitive`,
  options single/married/divorced, required; registered in
  `components/index.ts` (`_componentCount` 45 → 46). TDD via
  `builtin-registry.spec.ts`.
- Latest recipe versions only, edited in place: `temp-teacher 1.3.0` and
  `jobstart-plus 1.1.0` become bare refs; `pathways 1.0.0` keeps an overrides
  block.
- `temp-teacher-application.smoke.spec.ts`: `selectRadio` → `selectDropdown`
  for marital-status — required, not cosmetic, since the field now emits
  `<select>` and the radio helper would match nothing.

## Why we did it that way

- **Select, not radio, at the component level.** The component encodes the live
  forms' field type (the #738 baseline) rather than what staging happened to
  ship. Modeled on `parish.ts`; `ui.width` deliberately omitted — marital
  values are short, default width fits (parish/primary-school set `long` for
  long option labels).
- **Pathways keeps Widowed via override, not a fourth component option.** Its
  live form genuinely offers Widowed, and dropping it would orphan any
  existing `"widowed"` submissions. The override replaces the base options
  array wholesale (shallow merge in both resolvers —
  `apps/api/src/registry/resolution.ts` and
  `packages/form-builder/src/resolution.ts`), so the recipe restates all four
  options. The component itself stays at the three options shared by every
  other consumer.
- **Old recipe versions untouched.** Versioned recipes are immutable history;
  only the latest of each (per the request) was migrated. Older versions still
  carry the inline radio.
- **Verified through the real data path, not just unit tests.** The compose
  stack isn't runnable from this session, so end-to-end confirmation ran
  `hydrateForm(recipe, BUILTIN_REGISTRY-resolver)` (the exact path
  `form-definitions.service.ts` uses) over all three edited recipes and
  asserted the hydrated field is a required select with the right options.
  Rendering needs no per-type wiring — `form-renderer.tsx` keys on `htmlType`
  generically.

## Open questions

- #738 stays open: Title options, hints, Relationship free-text → dropdown,
  and the Parish placeholder are still outstanding parity gaps.
- A `recipe-invariants` check that every recipe ref resolves against
  `BUILTIN_REGISTRY` doesn't exist today; it would have made the hydration
  smoke script unnecessary.
