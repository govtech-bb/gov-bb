# 0001 Compose editors from explicit modules

Status: Accepted (implemented in this repository)

Recorded: 2026-10-05

## Context

The application needs ordinary content editing and form authoring to share editing behavior without making content editors depend on form concepts. Adding a capability affects saved nodes, validation, actions and rendering. Separate feature lists for these concerns could disagree about what an editor supports, particularly when loading a document outside the browser.

## Decision

Compose each editor from an explicit list of modules. The generic editor core owns composition, document validation and shared editing contracts. Form modules extend that core; application presets choose the installed modules and registry entries.

Resolve module declarations into an immutable definition. Check required capabilities, contribution identities, node ownership and history ownership during composition. Validate saved documents against that definition before hydration, rejecting unsupported content without silently substituting another node.

Use the same definition for headless and browser editors. Document registrations and initial preparation are shared; browser behavior is an additional lifecycle phase. Each editor owns its registrations and cleanup. A mounted editor's definition is fixed, so changing its capabilities requires a remount.

## Alternatives

- A form-specific core would make form behavior readily available everywhere, but ordinary content editors would inherit dependencies and assumptions they do not need.
- Separate content and form implementations would allow independent changes, but shared editing and document-loading rules could diverge.
- Mutable global registration would simplify discovering features, but make an editor's capabilities depend on registration order and activity elsewhere in the application.

## Consequences

Extensions have explicit ownership and can be exercised without mounting the full application. Composition errors surface before a document is loaded. Removing a capability can make an existing document unavailable to that configuration; callers must preserve the original for recovery.

Module authors must declare lifecycle responsibilities and dispose of registrations. Presets provide the composition point rather than becoming implicit dependencies of lower layers. These boundaries exist within this repository; this decision does not commit to separately published packages or runtime plugin installation.

## Evidence

- [Module composition and validation](../../src/editor/core/definition.ts)
- [Form-specific composition](../../src/forms/definition.ts)
- [Browser composition using headless preparation](../../src/editor/react/composer.tsx)
- [Enforced dependency boundaries](../../scripts/check-boundaries.ts)
- [Independent extension proofs](../../tests/extensions/external-extensions.test.ts)
