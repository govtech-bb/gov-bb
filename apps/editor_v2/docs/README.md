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

Run `pnpm dev:editor_v2` and open `http://localhost:3000`. Sign in to open the API Services list; old browser drafts are not restored.

- Create a service to get an entry page. Edit its title and body, and open **Preview page**.
- Choose **Add document** for an API start or supporting page. Save explicitly. Publish changes makes a page public; a change to a page that is already public is saved for an approver to publish. Choose **Submit for review** when it is ready; until an approver publishes or rejects it, the page can't be saved again. A rejection shows the approver's comment: save your edits to start a new change, or choose **Submit again** to send it back as it is. Changing who can see a public page changes nothing else, so save other edits first; taking it out of public view discards changes that are saved but not yet live, and the page then shows its last published content. A change waiting for review must be published or rejected first.
- Reusable form capabilities are shown in the examples and test-only browser host; they are not a workspace workflow.

[workspace.tsx](../src/workspace/workspace.tsx) composes API navigation and leave protection. [RemotePagePane](../src/workspace/remote-page-pane.tsx) owns server baselines/saves; [PageDraftEditor](../src/host/page-editor.tsx) connects the in-memory writer and editable site preview.

## Examples

| Example | What it covers |
| --- | --- |
| [Page and form composition](examples/editor-system.tsx) | Public imports, the app's presets, separate codecs, source-only pages and in-memory source binding |
| [Native demo definition](../src/presets/form-registry/demo.ts) | Question kinds, submitted keys, option values, logic, repetition and page roles |
| [Demo Markdown](examples/demo-form.md) | Converter output checked against the native demo, including its retained bindings |
| [Custom extension composition](../tests/browser/external-extensions.tsx) | Test modules for a Notice, Reference field and Applicant registry entry |

The exported React examples use the app's [stylesheet](../index.css). To refresh the documented Markdown after changing the native demo, run from `apps/editor_v2`:

```sh
pnpm generate:demo
pnpm exec vitest run docs/examples
```

## Regression fixtures

The [form fixtures](../tests/fixtures/forms/README.md) contain native JSON examples and frozen legacy migration samples. `demo.canonical.md` is a migration fixture; the [native demo definition](../src/presets/form-registry/demo.ts) supplies the registry's complete demo form.

The [page fixtures](../tests/fixtures/pages/README.md) retain 16 originals with recorded hashes: three visual regressions and 13 source-only cases. Integration tests also read current pages directly from `apps/landing/src/content`. Preserve fixture bytes and semantics when changing converters.
