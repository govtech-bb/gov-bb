# Severance calculator

Status: planned in a later dependent PR. Part of the [Smart tools roadmap](00-roadmap.md).

## Implementation

Extract maintained wording and named policy values: year-specific weekly/monthly ceilings, maximum service years, tier boundaries and weeks per tier. Keep the algorithm and end-date year selection. Present clear units, policy source and effective-period information. Validate positive ceilings and ordered, consistent service tiers.

## Acceptance checks

Unchanged data must give identical results on existing boundary tests. Run against draft ceilings/tier values and prove results and explanations use the same policy. Use stable policy fixtures for formula regression checks.

## Delivery

Follow the roadmap stage order. Preserve current public URLs and discovery metadata. Use the shared contract and existing renderer; register only the fields staff can maintain. A failed publication keeps the draft. The PR description must state completed validation and any actual limitation.
