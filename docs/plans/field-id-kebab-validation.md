# form_builder: kebab-case validation for the Field ID Override input

Issue: [#201](https://github.com/govtech-bb/gov-bb/issues/201)

## Goal

In the form_builder field edit panel, the **Field ID Override** input should only
accept kebab-case ids (`applicant-first-name`). While the value is invalid the user
sees an inline error explaining why; on blur the value is auto-normalized to
kebab-case. This applies to both top-level field overrides and block-child
overrides. The aim is to stop malformed ids (`My Field`, `camelCase`, `snake_case`,
special chars) from silently propagating into recipes and breaking downstream
field references.

## Approach

Reuse the validation the Step ID input already uses. `-step-editor.tsx` already
defines the exact rule the issue asks for — `STEP_ID_PATTERN =
/^[a-z][a-z0-9]*(-[a-z0-9]+)*$/`, a `kebabize()` normalizer, an inline
`role="alert"` error, and `aria-invalid` on the input. Rather than copy that into
the field panel, **extract the shared pieces into a co-located module** and have
both editors import them.

**Why this works.** The Field ID Override input lives in `OverrideForm`, a single
component that `-field-edit-panel.tsx` renders once for a top-level field and once
per block child. Putting the validation inside `OverrideForm` covers child
overrides for free — each rendered `OverrideForm` is its own component instance, so
local error state is naturally per-field.

**Why auto-normalize-on-blur (not hard reject).** The field panel commits overrides
only on **Save**, not per keystroke — so a "block the commit" model doesn't map
cleanly the way it does for the Step ID. Normalizing on blur keeps the value
always-valid by the time Save fires (blur fires before the Save button's click), and
the live inline error tells the user *why* the value changed under them.

**Alternatives considered.**
- *Copy `kebabize` + pattern into the field panel.* Rejected — two drifting copies
  of the same rule; extraction is a one-file change and de-dupes the existing one.
- *Hard-reject + disable Save while invalid.* Rejected per discussion — auto-fix on
  blur is less friction for this input.
- *Validate uniqueness too.* Out of scope (see Open questions) — the Step ID input
  doesn't check uniqueness either, so matching its scope keeps this focused.

## Scope

1. Add `apps/form_builder/app/routes/builder/ui/-id-validation.ts` exporting the
   shared `KEBAB_ID_PATTERN` and `kebabize(input)`.
2. Add `-id-validation.spec.ts` covering the pattern (accept/reject cases) and
   `kebabize` (uppercase → lowercase, spaces, underscores, mixed case,
   leading/trailing/repeated separators, empty result).
3. Point `-step-editor.tsx` at the shared module — import `KEBAB_ID_PATTERN` and
   `kebabize`, drop its local copies. Keep `STEP_ID_ERROR` and
   `STEP_ID_DEFAULT_PATTERN` local (step-specific wording / default-id rule).
4. In `-field-edit-panel.tsx`'s `OverrideForm`: add a live inline error on the Field
   ID Override input and auto-normalize on blur.
5. Manual smoke in the browser per [[feedback_user_smoke_tests]] — Isaiah to click
   through (no Playwright).
6. Follow-up issue for fieldId uniqueness collisions filed as
   [#206](https://github.com/govtech-bb/gov-bb/issues/206).

## Files

**Add**
- `apps/form_builder/app/routes/builder/ui/-id-validation.ts` —
  `export const KEBAB_ID_PATTERN = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;` and
  `export function kebabize(input: string): string` (same body currently in
  `-step-editor.tsx` — note it already lowercases via `.toLowerCase()` as its
  first step, so `My-Field` / `CamelCase` input normalizes to lowercase).
- `apps/form_builder/app/routes/builder/ui/-id-validation.spec.ts` — pure-function
  unit tests (runs under the existing Jest config; no DOM, so it doesn't touch the
  smoke-test preference).

**Modify**
- `apps/form_builder/app/routes/builder/ui/-step-editor.tsx` — import
  `KEBAB_ID_PATTERN` + `kebabize` from `./-id-validation`; remove the local
  `STEP_ID_PATTERN` and `kebabize`; replace `STEP_ID_PATTERN.test(...)` with
  `KEBAB_ID_PATTERN.test(...)`. No behaviour change here — pure refactor.
- `apps/form_builder/app/routes/builder/ui/-field-edit-panel.tsx` — in
  `OverrideForm`:
  - `const [fieldIdError, setFieldIdError] = useState("");`
  - input `onChange`: keep storing the raw value (`patch({ fieldId: e.target.value || undefined })`),
    and set/clear `fieldIdError` — error only when the value is non-empty and fails
    `KEBAB_ID_PATTERN` (blank stays valid → "use default").
  - input `onBlur`: `const normalized = kebabize(value); if (normalized !== value) patch({ fieldId: normalized || undefined }); setFieldIdError("")`.
  - render inline `<span role="alert">` with the field error message when set, and
    `aria-invalid={fieldIdError ? true : undefined}` on the input — mirror the Step
    ID markup/inline style.
  - define a `FIELD_ID_ERROR` message in this file ("Use lowercase letters, digits,
    and hyphens only. Must start with a letter (e.g. applicant-first-name).").

## Verify

1. **Unit tests** — `pnpm --filter form_builder test` (new `-id-validation.spec.ts`
   green; existing `-recipe-reducer.spec.ts` still green).
2. **Full build + tests** before commit per CLAUDE.md —
   `pnpm exec nx run-many -t build` and `pnpm exec nx run-many -t test`.
3. **Manual smoke** in Isaiah's browser:
   - Edit a field → type `My Field` in Field ID Override → red inline error shows
     while typing → blur → value becomes `my-field`, error clears.
   - Try `camelCase`, `snake_case`, `  spaced  `, `--leading-` → each normalizes
     sensibly on blur.
   - Type junk like `!!!` → normalizes to empty → reverts to default id (blank).
   - Leave it blank → no error, uses default id.
   - Repeat the above on a **block child** field (e.g. inside a Name or Address
     block) — same validation and normalization.
   - Save → reopen the field → the normalized id persisted.
   - Confirm the Step ID input still validates exactly as before (refactor didn't
     change its behaviour).

## Open questions

- **Uniqueness is out of scope.** Two fields can both normalize to the same id
  (e.g. both `name`) and silently collide, which still breaks references. Matching
  the Step ID input's scope, this change only checks *format*. Tracked separately
  in [#206](https://github.com/govtech-bb/gov-bb/issues/206).
- `kebabize` does not split camelCase on word boundaries (`camelCase` → `camelcase`,
  not `camel-case`) — this matches the existing Step ID behaviour and is acceptable;
  flagging only so it isn't mistaken for a bug.
