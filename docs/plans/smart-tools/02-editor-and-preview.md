# Shared authoring and actual public previews

Status: implemented; awaiting PR review and deployment. Part of the [Smart tools roadmap](00-roadmap.md).

## Implementation

Extend Content with registered Smart tools. Use labelled native controls for text, numbers, choices, dates, links, coordinates, hours and record collections. Support search, stable identity, keyboard ordering, local drafts, field errors and a readable change summary. Distinguish saved drafts, pending changes and live publication. Post validated drafts to each existing public renderer, with a versioned protocol, exact origin and frame checks. Introductions retain their Markdown editor.

## Acceptance checks

Exercise a pharmacy edit, draft restore, invalid hours, explicit removal, review and failed submission. Check the same editor with shelter data. Verify preview receives unsent changes, rejects untrusted messages, and keeps child-page navigation inside the draft. Inspect desktop/mobile and keyboard focus.

## Delivery

Follow the roadmap stage order. Preserve current public URLs and discovery metadata. Use the shared contract and existing renderer; register only the fields staff can maintain. A failed publication keeps the draft. The PR description must state completed validation and any actual limitation.
