# 0041 — The declaration step contains exactly one field

## Status

Accepted (2026-06-05)

## Context

Every form's required `declaration` step carried no fixed content contract.
The form builder seeded it empty (`fields: []`), leaving authors to add the
confirmation checkbox by hand, and the AI system prompt showed a
declaration-checkbox example but never forbade extra fields — its own Rule 1
example even placed a "Date of declaration" field inside the declaration
step. The result was drift: AI-generated and hand-built forms could end up
with declaration steps containing dates, signatures, or printed-name fields,
or with differently-named confirmation fieldIds, and a freshly created form
could be saved with an empty (meaningless) declaration step.

## Decision

The `declaration` step of every form contains **exactly one element**: the
`components/confirmation` checkbox with

- `fieldId: "declaration-confirmed"`
- `label: "Declaration"`
- a `required` validation ("You must confirm the declaration to continue")

Nothing else lives in the declaration step. Any other values a paper form's
declaration section collects (declaration date, signature, printed name,
witness) belong on a regular step **before** the declaration.

The contract is pinned in two places that must stay in agreement:

- **AI generation** — Rule 17 plus the Declaration Checkbox Pattern in
  `apps/form_builder_api/src/ai/system-prompt.ts`, guarded by
  `system-prompt.spec.ts`.
- **Builder seeding** — `makeDeclarationField()` in
  `apps/form_builder/app/routes/builder/-recipe-reducer.ts` seeds the field
  for new forms (and for older recipes whose declaration step is missing on
  `LOAD_DRAFT`), guarded by `-recipe-reducer.spec.ts`.

The statement text shown next to the checkbox (`options[0].label`) is *not*
part of the fixed contract: the builder seed leaves the registry default
("I confirm") for the author to edit per form, while the AI fills in the full
declaration statement it extracts from the source document.

## Consequences

- A brand-new form is born with a complete, valid declaration step; authors
  edit the statement text rather than assembling the checkbox.
- Recipe reviews and validators can treat a declaration step with more than
  one element, or a confirmation fieldId other than `declaration-confirmed`,
  as a defect.
- Loading an existing recipe never re-seeds or rewrites a present declaration
  step — author customisations (including a deliberately emptied step) are
  preserved; the seed applies only when the step is absent.
- Worked examples in prompts and docs must not place additional fields inside
  the declaration step; date-type guidance uses non-declaration examples.
