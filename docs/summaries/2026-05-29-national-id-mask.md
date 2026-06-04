# Forms: hard input mask for the National ID number field

## Context

Issue [#277](https://github.com/govtech-bb/gov-bb/issues/277). The National ID
number field needed to stop users entering the wrong length or invalid
characters — a hard cap, not a post-hoc error. Planned in
`docs/plans/national-id-mask.md` on branch `feat/national-id-mask` (cut from
`sandbox`).

The investigation found the masking engine was already fully built; the issue
reduced to supplying one piece of data:

- The forms renderer (`field-renderer.tsx`) already wraps every `text`/`number`/
  `tel`/`email` field in `<MaskedInput mask={field.mask} …>`.
- `MaskedInput` (`@maskito/react`) already supports the mask alphabet
  `9`=digit, `A`=letter, `*`=alphanumeric, with literals passing through, and
  hard-blocks overflow typing/paste.
- `mask` is already an optional property on the primitive schema and in the
  client-safe projection.
- Crucially, the API's `FormDefinitionsService.findByFormId` calls
  `registryService.hydrateForm(recipe)`, which resolves each
  `"ref": "components/…"` against the registry **at serve time** via a shallow
  merge (`{...component, ...overrides}`). So a property added to the canonical
  component propagates to every form that refs it — no recipe edits.

## What we did

- Added `mask: "999999-9999"` to the `NationalIdNumber` registry component
  (`packages/registry/src/components/national-id.ts`). It mirrors the existing
  `pattern` validation `^\d{6}-\d{4}$` (Barbados format, e.g. `850101-0001`).
- Added `national-id.spec.ts` asserting the mask value and that the component
  still parses under the `Primitive` discriminated union (written test-first:
  confirmed red on `undefined`, then green).

## Why we did it that way

- **Mask on the component, not the recipes.** `hydrateForm` resolves refs
  server-side, so one edit covers all 18+ forms that ref
  `components/national-id-number`. Editing each recipe JSON would be redundant
  and drift-prone. This follows ADR-0018 (registry is the sole home for builtin
  definitions). `mask` is a top-level property, so it survives even in recipes
  that override `validations` (e.g. `digital-media-training-programme-application`).
- **Hard mask, not soft `maxLength` + error.** The issue title says "stop …
  going past the right number of characters" — a physical cap. Maskito makes an
  11th digit or any letter impossible to type, so no error path is needed for
  overflow; the existing pattern error still covers incomplete input. Confirmed
  with the requester.
- **Mask string mirrors the pattern.** `999999-9999` and `^\d{6}-\d{4}$` encode
  the same shape; keeping both means the auto-inserted dash produces a value the
  pattern accepts, and a partial entry still fails the pattern as feedback.

## Status / follow-ups

- Build (`nx run-many -t build --exclude=landing`) green (13/13); `registry`,
  `forms`, `form-types` suites green (648 passed, 1 pre-existing skip).
- The full-suite `ai-bedrock:test` failure is a **pre-existing Windows-only**
  issue (bash-style `NODE_OPTIONS=… jest` prefix unparseable by `cmd`),
  unrelated to this change; passes on CI's Ubuntu.
- **Not yet done — real-browser smoke test.** Open a form that refs National ID
  (e.g. `apply-for-conductor-licence`), confirm letters are rejected, the dash
  auto-inserts after 6 digits, a 7th group digit can't be typed, and an
  over-long paste is truncated to `999999-9999`.
