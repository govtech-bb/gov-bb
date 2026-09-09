# Bank holiday calendar

Status: planned in a later dependent PR. Part of the [Smart tools roadmap](00-roadmap.md).

## Implementation

Make page wording and links maintainable while retaining the existing generated dates and statutory holiday engine. Keep the calendar interface and .ics behaviour. Do not add one-off holiday authoring as part of this migration.

## Acceptance checks

Prove generated dates and calendar downloads are unchanged. Preview edited explanation/source links. Pharmacy holiday calculations continue sharing the same holiday engine.

## Delivery

Follow the roadmap stage order. Preserve current public URLs and discovery metadata. Use the shared contract and existing renderer; register only the fields staff can maintain. A failed publication keeps the draft. The PR description must state completed validation and any actual limitation.
