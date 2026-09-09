# Self-employed National Insurance calculator

Status: planned in a later dependent PR. Part of the [Smart tools roadmap](00-roadmap.md).

## Implementation

Extract wording, contribution/benefit rates, earnings and contribution limits, grants, benefit periods, pension age and the existing suggested-contribution parameters. Keep algorithms in code and validate rates/bounds. Preserve the existing unverified-prototype warning and preview visibility; editorial publication does not certify figures or release the service.

## Acceptance checks

Retain existing output with baseline policy. Test changed policy through calculation and visible explanations. Confirm suggestions respect the configured ceiling and that release gates and warnings remain.

## Delivery

Follow the roadmap stage order. Preserve current public URLs and discovery metadata. Use the shared contract and existing renderer; register only the fields staff can maintain. A failed publication keeps the draft. The PR description must state completed validation and any actual limitation.
