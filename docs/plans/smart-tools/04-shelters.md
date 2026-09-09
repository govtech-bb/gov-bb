# Emergency shelter locator

Status: implemented; awaiting PR review and deployment. Part of the [Smart tools roadmap](00-roadmap.md).

## Implementation

Put shelter records, district chairs, hurricane terms, telephone directory, review dates, season and wording in emergency-shelters.json. Add permanent IDs once. Keep the landing, finder and guidance interfaces. Counts, accessibility lists and contact cards derive from supplied data. Planning capacity must never become a claim about live availability.

## Acceptance checks

Compare all 70 shelters, 27 chairs, 12 terms and original phone contacts/fields/order with the baseline. Edit accessibility and verify both finder and guidance change. Run the same draft/publication flow used for pharmacies.

## Delivery

Follow the roadmap stage order. Preserve current public URLs and discovery metadata. Use the shared contract and existing renderer; register only the fields staff can maintain. A failed publication keeps the draft. The PR description must state completed validation and any actual limitation.
