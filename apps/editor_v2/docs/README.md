# Documentation

The editor supports GovBB Markdown pages and native v2 forms. Start with the [app README](../README.md) for setup and [Product scope](../PRODUCT.md) for supported authoring behavior.

## Guides

| Task | Guide |
| --- | --- |
| Run the app, checks or browser tests; review known issues | [Development](DEVELOPMENT.md) |
| Understand module ownership, composition and persistence | [Architecture](ARCHITECTURE.md) |
| Add an answer control | [Adding a field](ADDING-A-FIELD.md) |
| Reuse questions, groups or complete forms | [Form registry](FORM-REGISTRY.md) |
| Import, export or migrate a document | [Converters](CONVERTERS.md) |
| Edit source or understand its syntax | [Page and form Markdown](MARKDOWN.md) |
| Use consistent authoring terms | [Terminology](TERMINOLOGY.md) |
| Understand architectural choices | [Decision records](decisions/README.md) |
| Check lint rules and validation exceptions | [Code quality](CODE-QUALITY.md) |
| Work with the legacy export adapter | [SSB compatibility](ssb-capabilities.md) |

## Try the workspace

Run `pnpm dev:editor_v2` from the GovBB repository root and open `http://localhost:3000`. Saved drafts are restored; a fresh workspace opens the loud-music permit form.

- Create a service to get an entry page. Edit its title and body, inspect **Markdown**, and open **Preview page**.
- Choose **Add document**, then **Loud music permit — form from registry** to create an independent example form. It includes road-closure logic and a repeating sound-system page. **JSON** shows its native definition; **Markdown** shows its editable draft.
- Choose **Application form** or **Calculator** to start with a blank question page.

[workspace.tsx](../src/workspace/workspace.tsx) composes the app. [Document operations](../src/workspace/documents.ts) select codecs and storage keys; [PageDraftEditor](../src/host/page-editor.tsx) and [WorkspaceFormEditor](../src/workspace/form-editor.tsx) connect authoring, source controls and local drafts.

## Examples

| Example | What it covers |
| --- | --- |
| [Page and form composition](examples/editor-system.tsx) | Public imports, the app's presets, separate codecs, source-only pages and host-supplied storage |
| [Native demo definition](../src/presets/form-registry/demo.ts) | Question kinds, submitted keys, option values, logic, repetition and page roles |
| [Demo Markdown](examples/demo-form.md) | Converter output checked against the native demo, including its retained bindings |
| [Custom extension composition](../tests/browser/external-extensions.tsx) | Test modules for a Notice, Reference field and Applicant registry entry |

The exported React examples use the app's [stylesheet](../index.css). To refresh the documented Markdown after changing the native demo, run from `apps/editor_v2`:

```sh
pnpm generate:demo
pnpm exec vitest run docs/examples
```

## Regression fixtures

The [form fixtures](../tests/fixtures/forms/README.md) contain native JSON examples and frozen legacy migration samples. `demo.canonical.md` is a migration fixture; the [native demo definition](../src/presets/form-registry/demo.ts) supplies fresh drafts.

The [page fixtures](../tests/fixtures/pages/README.md) retain 16 originals with recorded hashes: three visual regressions and 13 source-only cases. Integration tests also read current pages directly from `apps/landing/src/content`. Preserve fixture bytes and semantics when changing converters.
