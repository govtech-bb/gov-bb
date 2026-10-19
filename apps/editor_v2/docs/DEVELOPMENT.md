# Development

Start and Router are pinned together for compatibility. Their history package includes the fix that restores the current URL when blocked Forward or multi-entry navigation follows a failed draft save.

Run the app and the Nx checks from the repository root as shown in the [README](../README.md). The commands below run from `apps/editor_v2`.

## Focused checks

```sh
pnpm test
pnpm exec vitest run tests/pages
pnpm exec vitest run docs/examples
pnpm typecheck
pnpm lint
pnpm format:check
pnpm check:boundaries
pnpm check:coverage
```

The page tests use both fixed [regression fixtures](../tests/fixtures/pages/README.md) and current Markdown from `apps/landing/src/content`. Nx tracks that content as a test input. Form tests use independent inputs and expected results described in the [fixture guide](../tests/fixtures/forms/README.md).

Update the documented demo after an intentional change to `src/presets/form-registry/demo.ts`:

```sh
pnpm generate:demo
pnpm exec vitest run docs/examples
```

`generate:demo` is the only command that refreshes the documented Markdown. Ordinary tests compare the checked-in example without writing it.

Use [Code quality](CODE-QUALITY.md) for formatting commands and the validation exceptions in the lint configuration.

## App shell and routes

TanStack Start builds a static shell and renders the workspace in the browser. The root document must remain safe to render during the build; `localStorage` and document sessions belong to the client-only workspace layout. The configuration follows the official [Start setup](https://tanstack.com/start/latest/docs/framework/react/build-from-scratch), [SPA mode](https://tanstack.com/start/latest/docs/framework/react/guide/spa-mode) and [client entry](https://tanstack.com/start/latest/docs/framework/react/guide/client-entry-point) guides.

Routes use `/services`, `/services/$serviceId` and `/services/$serviceId/$documentId`; `/` opens Services. Old `/#/services/...` links are replaced on startup. The persistent workspace keeps visited editors mounted so each document retains its undo history. Navigation flushes the current draft before changing documents; save failures and unresolved recovery block navigation.

Start generates `src/routeTree.gen.ts` during development and builds. Keep that file checked in so standalone typechecks work on a fresh checkout. It is excluded from linting and formatting; edit route files instead. Vitest uses its own configuration without the Start plugin.

`getRouter` composes the Better Auth client from the public API origin. The workspace layout checks the API session before rendering. `/auth` stays outside that layout so failed sign-ins and sign-out cannot create redirect loops. The client includes cookies on API calls; its origin is configured with `VITE_API_ORIGIN`, which must be HTTPS in production. Building the static shell does not contact the API or GitHub.

## Browser checks

Start the app, then run the browser suites against the same URL:

```sh
PLAYWRIGHT_MODULE_PATH=/path/to/playwright-core \
  pnpm exec node scripts/browser/run.mjs http://localhost:3000/
```

The runner resolves an existing `playwright` or `playwright-core` installation, with `PLAYWRIGHT_MODULE_PATH` as an alternative. Chromium must be available to that installation. Each suite uses an isolated browser context.

App UI suites supply an employee session at the HTTP boundary through `scripts/browser/auth-fixture.mjs`; production has no authentication bypass. A new browser has no form, so form suites seed one at the storage boundary through `scripts/browser/form-fixture.mjs`: `openDemoForm` writes the documented demo as the browser's original form draft and opens it at its own route, and `seedFormDraft` and `formDraftUrl` do the same for a suite's own source. `authentication.mjs` separately exercises anonymous automatic login, callback confirmation, cancellation, unavailable authentication, sign-out and preservation of drafts that cannot be saved, using intercepted API/GitHub HTTP responses. Real GitHub consent and deployment cookies require a configured deployment smoke test.

`remote-page-editing.mjs` intercepts the content API to verify remote page editing, optimistic save conflicts, selective history restoration and storage/reload preservation. `service-workspace.mjs` separately covers browser-local services and documents; it is not remote-save coverage.

Pass suite names after the URL to run a subset:

```sh
pnpm exec node scripts/browser/run.mjs http://localhost:3000/ page-writer.mjs service-workspace.mjs
```

Avoid editing source while checking undo and document switching: a development reload can reset in-memory editor history. The insertion/undo regression starts on a question page because confirmation pages reject answer insertion.

## Persistence and recovery

Draft keys are supplied by the host. Workspace navigation is stored at `govbb-editor:workspace:v1`, and a collapsed service sidebar at `govbb-editor:sidebar-collapsed`; documents use `govbb-editor:documents:<uuid>:...`. Earlier registry drafts use `govbb-editor:forms:<uuid>:...` and are discovered through `govbb-editor:active-draft`.

The original form draft uses these keys:

| Purpose | Key |
| --- | --- |
| Saved Markdown | `govbb-editor:draft:markdown:v2` |
| Previous Markdown backup | `govbb-editor:draft:markdown:v1` |
| Legacy JSON backup | `govbb-editor:draft` |
| Unapplied source | `govbb-editor:draft:markdown:working` |
| Original input before native migration | `govbb-editor:draft:native-original` |
| Interrupted JSON replacement | `govbb-editor:draft:replacement` |

A page from the content API keeps its browser draft under its page id, beside `govbb-editor:documents:<id>:server`: the server version it was last loaded or saved as, and the Markdown that stood for it. The draft has unsaved changes while its Markdown differs from that version's, and Save sends that version's `updated_at` as `if-updated-at`.

The API's types in `src/api/openapi.d.ts` are generated from `apps/api_v2/openapi.json`; when the API's spec changes, regenerate them with `pnpm exec vitest run src/api/openapi.test.ts -u`.

Keep these keys stable when changing persistence. Unapplied source must survive reload, failed imports must retain the original input, and JSON replacement must retain the previous draft until recovery completes. Apply validates before replacing editor state. A storage failure must leave the unsaved work available for retry; conflicts between tabs require an explicit choice.

Native IDs, answer keys, option values and Markdown anchors have different roles. Copying content remaps references and identities while retaining submitted values and opaque strings. See [Converters](CONVERTERS.md) for the preservation rules.

## Source import migration

The naming refactor changes repository source paths and symbols, not HTTP APIs or saved data. Existing barrel paths (`src/editor`, `src/forms`, `src/pages`, `src/host`) remain. No tracked source consumers were found outside this app; unknown external source consumers must update their imports using the map below. No blanket compatibility aliases were added.

Paths below are relative to `src`. Symbols not listed as renamed keep their names.

| Previous source | Current source |
| --- | --- |
| `workspace/api-pages.ts` synchronization | `workspace/page-sync.ts`: `ServerBase` → `ServerPageBaseline`, `SaveOutcome` → `PageSaveOutcome`, `serverBaseKey` → `serverPageBaselineKey`, `parseServerBase` → `parseServerPageBaseline`, `writeServerBase` → `writeServerPageBaseline`, `seedApiPage` → `seedPageDraftFromServer`, workspace `savePage` → `savePageDraft` |
| `workspace/api-pages.ts` service mapping | `workspace/service-pages.ts`: `apiPageDocument` → `pageDocumentFromApi`, `serviceDocuments` → `servicePageDocuments`, `roleOf` → `inferServicePageRole` |
| `workspace/api-pages.ts` Markdown helpers | `api/page-markdown.ts`: `restoredMarkdown` → `pageVersionToDraftMarkdown`, `fieldLabel` → `pageFieldLabel` |
| `workspace/api-page.tsx` | `workspace/remote-page-pane.tsx`: `ApiPagePane` → `RemotePagePane`, private `ApiPageEditor` → `RemotePageEditor`, `useServerBase` → `useServerPageBaseline`, `notifyServerBase` → `notifyServerPageBaseline` |
| `workspace/api-service.tsx` | `workspace/service-nav.tsx`: `ApiServiceNav` → `ServiceNav`, which also lists services drafted in the browser |
| `workspace/api-history.tsx` | `workspace/page-history-dialog.tsx`; `PageHistoryDialog` unchanged |
| `workspace/api-dialogs.tsx` | `workspace/remote-page-dialogs.tsx`: `ApiServiceDialog` → `CreateRemoteServiceDialog`, `ApiPageDialog` → `CreateRemotePageDialog`, `DeletePageDialog` → `DeleteRemotePageDialog` |
| `workspace/dialogs.tsx` | `workspace/local-document-dialogs.tsx`: `ServiceDialog` → `LocalServiceDialog`, `DocumentDialog` → `AddLocalDocumentDialog`; shared `WorkspaceDialog` moves to `workspace/workspace-dialog.tsx`, `inputClass` → `workspaceDialogInputClass` |
| Workspace model types only | `FormDocument` → `WorkspaceFormDocument`, `PageRole` → `ServicePageRole`, `Service` → `WorkspaceService`; the form AST/schema types are unchanged |
| `api/client.ts` input types | `NewPage` → `CreatePageInput`, `SaveFields` → `SavePageInput`; transport method `EditorApi.savePage` unchanged |
| `api/page-markdown.ts` save conversion | `SaveFieldsResult` → `PageSaveInputResult`, `markdownToSaveFields` → `markdownToPageSaveInput` |
| `api/queries.ts` | `historyQuery` → `pageHistoryQuery`, `versionQuery` → `estateVersionQuery`; cache keys and timing unchanged |
| `converters/lexicalToMarkdown/index.ts` | `converters/lexical-to-form-markdown.ts`: `lexicalToMarkdown` → `lexicalToFormMarkdown` |
| `converters/markdownToLexical/index.ts` | `converters/form-markdown-to-lexical.ts`: `markdownToLexical` → `formMarkdownToLexical` |
| `converters/formSchemaToLexical/index.ts` | `converters/form-schema-to-lexical.ts` |
| `converters/lexicalToFormSchema/index.ts` | `converters/lexical-to-form-schema.ts` |
| `converters/lexicalToLegacySsb/index.ts` | `converters/lexical-to-legacy-ssb.ts` |
| `converters/pageMarkdownToLexical/index.ts` | `converters/page-markdown-to-lexical.ts`; still re-exports the page implementation |
| `converters/lexicalToPageMarkdown/index.ts` | `converters/lexical-to-page-markdown.ts`; still re-exports the page implementation |
| `forms/editor/codec.ts` | `createDraftCodec` → `createFormDraftCodec` |
| `host/form-schema-ui.tsx` | `host/form-json-dialog.tsx`: `FormSchemaEditor` → `FormJsonDialog` |
| `ui/table/hook.ts` | `ui/table/table-hooks.ts`; exports unchanged |

There is no data migration: `govbb-editor:documents:<id>:server` still stores `{ page, markdown }`, and all existing draft/workspace keys, schema versions and routes remain unchanged. The app/package/Nx names remain `apps/editor_v2`, `@govtech-bb/editor-v2`, `editor_v2` and `dev:editor_v2`. Backend naming is a separate future review.

Historical probes such as `rb4.mjs`, `step3-ui.mjs`, `step5-ui.mjs` and other numbered browser scripts are deferred pending confirmation of their use. They and legacy fixtures are not renamed or counted as passing regression checks.

## Known issues

- The Other switch can disagree with the option after that option is deleted. An ordinary Other choice with a conditional follow-up is available.
- Selecting Custom for a time increment does not retain a separate custom mode; the seconds editor remains visible.
- Checks for missing declaration or confirmation pages navigate to page 1 rather than the relevant insertion point.
- Require answer can target a field that is already required without a useful warning.
- Closing the source dialog with unapplied edits pauses the canvas without a clear explanation.
- Advanced → Internal alias saves in a draft, but native JSON export rejects the `name` setting. Use the visible question label in logic selectors until aliases have a native mapping.
- The loud-music demo requires both National ID and passport even though its Details text presents them as alternatives. Its definition needs conditional requirements; the documented demo and example test currently preserve that behavior.

Address lookup and opening hours provide authoring examples, not live integrations. Calculator fixtures are regression data: NIS prototype rates have not been verified for production use, and severance cases use explicit complete-years and end-year inputs.
