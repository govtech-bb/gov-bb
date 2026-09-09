# Government pension calculator

Status: planned in a later dependent PR. Part of the [Smart tools roadmap](00-roadmap.md).

## Implementation

Extract wording plus service warning threshold, full-pension months, reduced-pension share and gratuity multiplier. Keep service-duration and calculation algorithms. Derive displayed percentages, denominators and thresholds from the same policy used by the calculator.

## Acceptance checks

Keep baseline results across current date/service boundaries. Verify draft parameters update results and explanations together. Reject invalid rates, negative values and an inconsistent warning/cap threshold.

## Delivery

Follow the roadmap stage order. Preserve current public URLs and discovery metadata. Use the shared contract and existing renderer; register only the fields staff can maintain. A failed publication keeps the draft. The PR description must state completed validation and any actual limitation.
