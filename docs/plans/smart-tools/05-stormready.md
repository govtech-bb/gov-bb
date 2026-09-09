# StormReady checklist

Status: planned in a later dependent PR. Part of the [Smart tools roadmap](00-roadmap.md).

## Implementation

Extract seven sections and 38 checklist items into canonical JSON with unchanged IDs. Make section names, hints, item labels, season/review date and page wording editable. Keep saved-progress and print behaviour in code. Count only IDs in the current checklist while retaining saved data for temporarily absent items.

## Acceptance checks

Prove every original ID and label survives. Check editing/reordering does not transfer progress to another item. Add/remove a draft item and verify progress totals and printing use the current draft.

## Delivery

Follow the roadmap stage order. Preserve current public URLs and discovery metadata. Use the shared contract and existing renderer; register only the fields staff can maintain. A failed publication keeps the draft. The PR description must state completed validation and any actual limitation.
