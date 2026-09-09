# Pharmacy locator

Status: implemented; awaiting PR review and deployment. Part of the [Smart tools roadmap](00-roadmap.md).

## Implementation

Keep the finder, pharmacy details, URLs, stable slugs, opening calculations and slip rules. Extend pharmacies.json with schemaVersion and maintained wording. Extract no records from partial documents as deletions. Edit contacts, addresses, PPP status, source information, coordinates, notes, weekly hours and holiday overrides. Unknown, closed, split shifts and midnight remain distinct.

## Acceptance checks

Compare all original records and fields to the implementation baseline (163 records). Test C S Pharmacy and a second record independently; use fixed behaviour fixtures so ordinary editorial changes do not fail CI. Finder and detail previews must both use the supplied draft.

## Delivery

Follow the roadmap stage order. Preserve current public URLs and discovery metadata. Use the shared contract and existing renderer; register only the fields staff can maintain. A failed publication keeps the draft. The PR description must state completed validation and any actual limitation.
