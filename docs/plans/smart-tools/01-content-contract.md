# Shared content and publication contract

Status: implemented; awaiting PR review and deployment. Part of the [Smart tools roadmap](00-roadmap.md).

## Implementation

Register stable service IDs, kinds, labels, fields and public views in packages/content. Keep write paths on the form-builder server. Use schemaVersion 1 JSON and the existing session, GitHub client and atomic commit helper. Preserve unknown fields and omitted records, require explicit removals, validate at publication, and bind drafts to the loaded blob and PR head.

## Acceptance checks

Schema tests cover partial edits, unknown data, additions, explicit removals, fixed collections, hours, duplicate IDs and incompatible versions. Server tests cover current/stale revisions, manual and competing PRs, an unavailable review inventory, invalid targets, atomic updates and failure recovery.

## Delivery

Follow the roadmap stage order. Preserve current public URLs and discovery metadata. Use the shared contract and existing renderer; register only the fields staff can maintain. A failed publication keeps the draft. The PR description must state completed validation and any actual limitation.
