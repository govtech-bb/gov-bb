# Architecture decisions

These records explain the choices that shape editor modules, document formats and persistence. The [architecture guide](../ARCHITECTURE.md) describes their implementation.

| Record | Decision |
| --- | --- |
| [0001](0001-compose-editors-from-explicit-modules.md) | Compose editors from explicit modules |
| [0002](0002-use-a-native-form-json-contract.md) | Use a native form JSON contract |
| [0003](0003-preserve-editable-drafts-in-markdown.md) | Preserve editable drafts in Markdown |
| [0004](0004-own-conditional-behavior-in-logic-blocks.md) | Keep conditional behavior in explicit logic blocks |
| [0005](0005-insert-registry-entries-as-independent-copies.md) | Insert registry entries as independent copies |
| [0006](0006-keep-draft-persistence-in-the-host.md) | Keep draft persistence in the host |
| [0007](0007-service-workspaces-and-markdown-pages.md) | Separate service pages from form documents |

**Accepted** decisions are in use by this editor. **Recorded** is the date the record was written. When a decision changes, link its replacement and mark the earlier record superseded.

Add a record when a choice changes module ownership, a stored or exchanged contract, extension APIs, or preservation of authored work. Keep implementation details in the guides: [terminology](../TERMINOLOGY.md), [development](../DEVELOPMENT.md) and [code quality](../CODE-QUALITY.md).
