# Crop Over decision guide

Status: planned in a later dependent PR. Part of the [Smart tools roadmap](00-roadmap.md).

## Implementation

Extract the ten permits and guidance into canonical JSON with stable IDs. Allow names, agency details, links, fees guidance, contacts, required documents and explanatory wording. Keep the permit catalogue, condition matching, questions and step numbering developer-owned; no staff-created condition language.

## Acceptance checks

Preserve every original permit and condition. Compare selections and numbering across existing answers before/after extraction. Preview edited guidance and contacts through the existing helper.

## Delivery

Follow the roadmap stage order. Preserve current public URLs and discovery metadata. Use the shared contract and existing renderer; register only the fields staff can maintain. A failed publication keeps the draft. The PR description must state completed validation and any actual limitation.
