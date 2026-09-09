# Coverage, rollout and handover

Status: planned in a later dependent PR. Part of the [Smart tools roadmap](00-roadmap.md).

## Implementation

Check all nine service groups, including child pages, have working load/edit/validate/preview/publish paths. Document staff editing, review, conflict recovery and rollback; document adding a new registered type. Reuse the existing public content registry and release gates. Register future tools by their own structure and renderer, never by forcing a locator template.

## Acceptance checks

Run affected tests, TypeScript, lint, formatting, workspace build and CI. Review data-preservation reports. Complete desktop/mobile/keyboard inspection where browser access is available and record any unavailable check. Publish reviewable PRs in the sequence below; do not merge or claim deployment from PR creation.

## Delivery

Follow the roadmap stage order. Preserve current public URLs and discovery metadata. Use the shared contract and existing renderer; register only the fields staff can maintain. A failed publication keeps the draft. The PR description must state completed validation and any actual limitation.
