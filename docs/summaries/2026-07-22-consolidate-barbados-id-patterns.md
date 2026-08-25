# Session summary — Consolidate Barbados national-ID formats (#2073)

**Date:** 2026-07-22 · **Branch:** `consolidate-barbados-id-patterns-2073` (off `main`) · part of #1423

## What shipped

The four Barbados identifier fields (National ID, National Insurance, Postcode,
TAMIS) each hard-coded their own `pattern` + `mask` + error message. They now
share one module — the identifier-field analogue of `person-name-pattern.ts`
(#1843).

- **New** `packages/registry/src/barbados-id-patterns.ts` — one
  `{ pattern, mask?, error }` record per identifier (`NATIONAL_ID_FORMAT`,
  `NATIONAL_INSURANCE_FORMAT`, `POSTCODE_FORMAT`, `TAMIS_FORMAT`), re-exported
  from the registry barrel (+ spec).
- The four components reference it; inline literals removed. `label`/`ui`/
  `minLength`/`maxLength` unchanged.
- Two fixes: error phrasing normalised to `Enter a valid <field> (for example,
  <sample>)`, and TAMIS pattern tightened `^\d*$` → `^\d+$`.

## Why it looks the way it does

- **One module per concern, objects (not flat consts).** `person-name-pattern.ts`
  exports flat constants, but an identifier carries three related bits
  (pattern/mask/error), so an object per identifier reads better. Placed at
  `src/` top-level to sit beside its sibling (not under `components/`, despite the
  issue's suggested path).

- **Error normalisation is a deliberate user-visible change.** Unlike the
  name/date consolidations (which were "no user effect"), this issue's goal
  includes fixing inconsistent/mislabelled phrasing, so the messages citizens see
  change slightly. The clearest fix: `national-id` was *labelled* "National ID
  number" but its error said just "ID number" — now
  "Enter a valid National ID number (for example, 850101-0001)". NIS drops its
  redundant "(6 digits, …)" for the uniform shape.

- **TAMIS `^\d*$` → `^\d+$` is behaviour-preserving for users.** The old pattern
  matched the empty string on its own; only the separate `minLength: 10` rule
  rejected empty input. Tightening to `+` makes the pattern correct by itself
  (defence in depth) without changing what any real user experiences. TAMIS has
  no fixed canonical sample, so its message uses a hint ("digits only") rather
  than an example.

- **Blast radius handled.** Two tests asserted old values and were updated:
  `tamis-number.spec.ts` (asserted `^\d*$`) and the `form_builder`
  field-edit-panel spec (asserted the old national-ID error string). Other
  postcode-message references elsewhere are independent local fixtures with their
  own wording, so they were untouched.

## Verification

- #2073 repro passes: `new RegExp(TamisNumber.validations.pattern.value).test("")` → `false`.
- registry 71, form_builder field-edit-panel 30, form-builder 178, forms 788 — pass.
- `nx run-many -t build --exclude=landing` — 20 projects compile; lint clean.
- No stale references to the old error strings / old TAMIS pattern anywhere.
