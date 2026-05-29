# National ID number input mask (#277)

## Goal

Stop users entering a National ID number that's the wrong length or contains
invalid characters. As they type, the field hard-limits input to the Barbados
National ID shape — six digits, a dash, four digits (`850101-0001`) — auto-inserting
the dash and rejecting any character (or paste) beyond that. No way to type an
11th digit or a letter.

## Approach

Add a single `mask` property to the canonical registry component
`NationalIdNumber`. The rendering engine already does everything else:

- The forms renderer (`field-renderer.tsx`) already renders
  `<MaskedInput mask={field.mask} …>` for `text` fields.
- `MaskedInput` (`@maskito/react`) already supports the mask alphabet
  `9`=digit, `A`=letter, `*`=alphanumeric, with literal characters passing
  through. Maskito enforces max length, blocks disallowed characters, blocks
  overflow-paste, and auto-inserts literals.
- `mask` is already a valid optional property on the primitive schema
  (`packages/form-types/src/primitive.type.ts`) and is in the client-safe
  projection.
- The API's `hydrateForm` resolves `"ref": "components/national-id-number"`
  **server-side at serve time** via a shallow merge (`{...component, ...overrides}`).
  So adding `mask` to the component propagates to all 18+ forms that ref it
  with **no recipe JSON edits**. No recipe currently overrides `mask`, and
  `mask` is a top-level property, so even recipes that override `validations`
  (e.g. `digital-media-training-programme-application`) still inherit the mask.

The mask value is `"999999-9999"`, which exactly mirrors the existing
`pattern` validation `^\d{6}-\d{4}$`. A completed entry (`850101-0001`)
satisfies that pattern; a partial entry still fails it, so the existing
pattern error (`Enter a valid ID number (for example, 850101-0001)`) remains
the feedback for incomplete input. Error styling and `aria-invalid` are
already wired in the renderer — untouched.

### Alternatives considered

- **Soft `maxLength` validation** (let the user overflow, then show an error).
  Rejected — the issue title says "stop … going past the right number of
  characters", i.e. a hard limit. Confirmed with the requester: hard mask.
- **Editing the mask into each of the 18+ recipe JSONs.** Unnecessary and
  error-prone — `hydrateForm` resolves the ref against the live component, so
  one edit covers them all.

## Scope

- Add `mask: "999999-9999"` to the `NationalIdNumber` registry component.
- Add/extend a registry unit test asserting the component carries the mask
  (guards against regression / accidental removal).

## Files

- `packages/registry/src/components/national-id.ts` — add the `mask` property.
- `packages/registry/src/*.spec.ts` — assert `NationalIdNumber.mask === "999999-9999"`
  (place alongside the existing builtin-registry / raw-primitives specs).

## Verify

- `pnpm exec nx run-many -t build` and `-t test` are green (per CLAUDE.md).
- Manually (or via the existing forms e2e harness against a form that refs
  National ID, e.g. apply-for-conductor-licence): typing letters is rejected;
  the dash auto-inserts after 6 digits; a 7th group digit can't be typed;
  pasting a too-long string is truncated to `999999-9999`.
- A complete value passes validation; an incomplete value shows the existing
  pattern error.

## Branch

Cut a new branch from `sandbox` (the most current base; the in-flight
design-system migration is based here too).

## Closing out

Per CLAUDE.md, after the work lands: comment on #277 summarizing the
resolution (link the PR/commit) and close it. #277 was named explicitly in
this plan, so no extra confirmation is needed before closing.

## Open questions

- None blocking. Format and hard-mask approach confirmed with the requester.
