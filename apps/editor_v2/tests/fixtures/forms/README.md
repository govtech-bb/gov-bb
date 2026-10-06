# Form fixtures

These fixtures cover native schema validation, editor conversion, draft recovery and compatibility exports. Expected results are checked independently of the code under test.

| Files | Purpose |
| --- | --- |
| `v2/` service and calculator definitions | Seven complete forms for native JSON and Markdown round trips, editing and branch behavior. Calculator tests share these definitions. |
| `v2/examples/` | Focused identity, passport and repetition examples. |
| `v2/bindings.json`, `v2/features.json`, `v2/registry.json` | Field, content, logic and registry examples used by capability checks. |
| `v2/capabilities.json` | Maps supported capabilities to their owners, tests and fixture evidence. |
| `v2/manifest.json` | Records form expectations and SHA-256 hashes of native definitions and source evidence. |
| `source/` | Independently captured source controls, branch cases and expected calculator results. |
| `*.canonical.md`, `*.legacy-ssb.json` | Expected Markdown and legacy SSB projections for the demo, legacy drafts and field-logic input. SSB projections include readiness issues, logic issues and compatibility warnings. |
| `field-logic-draft.md`, `native-upgrade-v2.md` | Inputs covering incomplete authored data, field settings, rules, formulas and native conversion. |
| `insertion-order.json`, `registry-entry-baseline.json` | Fixed ordered action IDs for insertion and registry checks. |

Legacy Markdown and serialized-editor inputs are shared with browser tests in [`scripts/browser/fixtures`](../../../scripts/browser/fixtures): `legacy-markdown-v1.md` and `legacy-step9.json`.

The frozen `demo.canonical.md` exercises legacy draft loading. The current application demo is defined in [`src/presets/form-registry/demo.ts`](../../../src/presets/form-registry/demo.ts), with its Markdown example in [`docs/examples/demo-form.md`](../../../docs/examples/demo-form.md).

## Updating fixtures

Keep source evidence and expected output independent. Do not regenerate expected results from the converter merely to make a failing test pass. For an intentional format or behavior change, update the affected expectation, add a focused assertion, and explain the change in the PR.

Preservation comparisons normalize only generated condition/action row UUIDs. Field and option identities, reference targets, submitted values, wording, formulas and opaque strings remain significant. Update manifest hashes only when the corresponding input has deliberately changed.

Run the app checks from `apps/editor_v2`:

```sh
pnpm test
pnpm check:coverage
```
