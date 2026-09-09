# Water outage information

Status: planned in a later dependent PR. Part of the [Smart tools roadmap](00-roadmap.md).

## Implementation

Extract page guidance, help/contact links and confirmation/unsubscribe result wording. Keep feed requests, parish geometry, matching, delivery and token handling in code. Preview the real page and message components with sample outcomes; preview must never subscribe, confirm or unsubscribe.

## Acceptance checks

Exercise every maintained result state. Assert preview cannot invoke subscription/token handlers. Existing live feed and subscription tests continue to pass, and empty/error states remain understandable.

## Delivery

Follow the roadmap stage order. Preserve current public URLs and discovery metadata. Use the shared contract and existing renderer; register only the fields staff can maintain. A failed publication keeps the draft. The PR description must state completed validation and any actual limitation.
