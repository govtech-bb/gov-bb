# Development

Start and Router are pinned together. Their history package restores the current URL when Back, Forward or multi-entry navigation is cancelled by the unsaved-work guard.

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

TanStack Start builds a static shell and renders the workspace in the browser. Keep the root document safe to render during builds. Editing state belongs to the client-only workspace; browser storage is used only for unrelated clipboard data and UI preferences.

Routes use `/services`, `/services/$serviceId`, `/services/$serviceId/$documentId` and `/categories`; `/` opens Services. Old `/#/services/...` links are replaced on startup. Clean views are cached with per-page undo; dirty/error/pending views cannot be silently evicted. Leaving unsaved work asks before changing documents. Confirmed discard removes the copy and its undo session; navigation never flushes or saves.

Start generates `src/routeTree.gen.ts` during development and builds. Keep that file checked in so standalone typechecks work on a fresh checkout. It is excluded from linting and formatting; edit route files instead. Vitest uses its own configuration without the Start plugin.

`getRouter` composes the Better Auth client from the public API origin. The workspace layout checks the API session before rendering. `/auth` stays outside that layout so failed sign-ins and sign-out cannot create redirect loops. The client includes cookies on API calls; its origin is configured with `VITE_API_ORIGIN`, which must be HTTPS in production. Building the static shell does not contact the API or GitHub.

api_v2 serves the category endpoints in [ADR 0078](../../../docs/decisions/0078-category-write-rules.md), but category management stays a frontend preview until the editor sends those writes (#3178). `savedCategoriesQuery` reads `GET /editor/categories` for page settings and Create service; preview edits never reach it. `createEditorApi` seeds the preview from that list once and reads `/services` on each category refresh for current counts. Add, edit and move update the in-memory list; delete rechecks service counts first. A read uses the latest local list after its network requests finish. Moves update the query cache without a remote-save queue. The saved category name is retained for Services filters. Preview changes survive internal navigation, but reload resets them. These local methods do not implement the ADR's write rules; #3178 replaces them with its persisted writes, stale-write handling and Services filters by slug.

Only the sign-in button starts OAuth. Initial admission and callback checks use contextual entry pending views; content preloads remain non-blocking, and the router has no blanket full-page loading component. `LoadingState` shows its label visibly and announces it once. Lists and page panes handle their own first-load and refresh states: transient network/5xx failures retain usable data, while session/access/deletion failures remain explicit without silently discarding open drafts. Unexpected route failures offer an app-owned retry, not a document reload.

## Browser checks

Start the app, then run the browser suites against the same URL. The full suite includes site preview: also build/start landing and set `VITE_SITE_PREVIEW_URL` in the CMS and test-process environments as described in [Site preview](SITE-PREVIEW.md). Its normal-page reference defaults to `http://127.0.0.1:3040`:

```sh
PLAYWRIGHT_MODULE_PATH=/path/to/playwright-core \
  pnpm exec node scripts/browser/run.mjs http://localhost:3000/
```

The runner resolves an existing `playwright` or `playwright-core` installation, with `PLAYWRIGHT_MODULE_PATH` as an alternative. Chromium must be available to that installation. Each suite uses an isolated browser context.

App UI suites supply employee/API responses at the HTTP boundary. `authentication.mjs` covers explicit sign-in, duplicate activation, delayed session/callback checks, deep-link return paths, outages, sign-out and cancelled expiry without revoking auth prematurely. It also captures transient framework-error screens and uncaught errors. Reusable form and page-canvas suites use `buildBrowserFixture` and `tests/browser/editor-host.tsx`, intercepted only by Playwright—not a production route. `openDemoForm` and `seedFormSource` supply explicit source; `reloadEditorFromSource` explicitly exports and reopens it to test conversion. A normal reload restores only fixture input. No production draft-storage seeding is needed. Real GitHub consent/cookies still require a deployment smoke test.

`remote-page-editing.mjs` checks explicit saves, version conflicts, undo/redo, safe preview links, the absence of history controls/requests and API reloads; `service-workspace.mjs` checks API creation/deletion and holds list/service/page/category responses to verify contextual loading without remounting the header. Run the auth and service-workspace suites against both development and production-built `dist/client` served with the documented `/_shell.html` rewrite; keep auth bypass off for these checks. `routing.mjs` checks cancelled links/Back/Forward, reload/tab-close warnings and clean-view eviction. `persistence-isolation.mjs` seeds malformed old keys and proves editing/lifecycle events neither read nor write them.

`categories.mjs` checks the desktop menu/rail and mobile drawer/row menu, keyboard move focus, local add/edit/delete, validation, renamed-category service links, reload reset, and isolation from the real service/page category pickers. It also checks the component gallery's mobile menu trigger.

Pass suite names after the URL to run a subset:

```sh
pnpm exec node scripts/browser/run.mjs http://localhost:3000/ page-writer.mjs service-workspace.mjs
```

Avoid editing source while checking undo and document switching: a development reload can reset in-memory editor history. The insertion/undo regression starts on a question page because confirmation pages reject answer insertion.

## Editable site preview checks

[Site preview](SITE-PREVIEW.md) documents the landing renderer build, `VITE_SITE_PREVIEW_URL`, local two-app setup and production asset delivery. `scripts/browser/site-preview.mjs <cms-url> [landing-url]` uses the actual authenticated route with API fixtures to verify editing/history, matched public-page rendering, style lifecycle, error recovery and explicit publication. Run it against development and production-built CMS output. `site-preview-parity.mjs <landing-url>` separately compares the fresh renderer to the ordinary mentor page.

The page-writer fixture builds its own bundle, so pass `VITE_SITE_PREVIEW_URL` to the browser-test process as well as the dev server. Keep the normal landing reference available while running these suites. Real deployment headers, sign-in, assistive technology and phone IME still need manual checks; synthetic composition and narrow viewports are not substitutes.

## Persistence and recovery

Unsaved edits exist only in memory. Save/Publish validates and sends the applied snapshot with the baseline's `updated_at` as `if-updated-at`. Failed requests preserve work for retry or download. HTTP 409 requires an explicit conflict choice; background reads never silently advance the write token.

Apply is not Save. Invalid/unapplied source and serialization errors also count as unsaved work. Cancelled navigation/sign-out retains edits and undo. Pending saves block departure. A crash, refresh, closed tab or confirmed departure loses unsaved work; unload warnings are best-effort, not recovery.

The sidebar preference `govbb-editor:sidebar-collapsed` and clipboard storage remain. Old `govbb-editor:draft*`, `documents:*`, form/workspace and server-baseline records are left untouched and never loaded.

API types in `src/api/openapi.d.ts` come from `apps/api_v2/openapi.json`; regenerate after an API spec change with `pnpm exec vitest run src/api/openapi.test.ts -u`.

Native IDs, answer keys, option values and Markdown anchors remain distinct. Imports validate before Apply and retain failed input in memory. See [Converters](CONVERTERS.md).

## Source import migration

The naming refactor changes repository source paths and symbols, not HTTP APIs or saved data. Existing barrel paths (`src/editor`, `src/forms`, `src/pages`, `src/host`) remain. No tracked source consumers were found outside this app; unknown external source consumers must update their imports using the map below. No blanket compatibility aliases were added.

Paths below are relative to `src`. Symbols not listed as renamed keep their names.

| Previous source | Current source |
| --- | --- |
| `workspace/api-pages.ts` synchronization | `workspace/page-sync.ts`: `ServerPageBaseline`, `PageSaveOutcome`, `savePageDraft`; browser baseline storage/seeding helpers removed |
| `workspace/api-pages.ts` service mapping | `workspace/service-pages.ts`: `apiPageDocument` → `pageDocumentFromApi`, `roleOf` → `inferServicePageRole`; local `serviceDocuments` joins removed |
| `workspace/api-pages.ts` Markdown helpers | `api/page-markdown.ts`: `fieldLabel` → `pageFieldLabel`; `restoredMarkdown` removed with saved-page history |
| `workspace/api-page.tsx` | `workspace/remote-page-pane.tsx`: `RemotePagePane`, private `RemotePageEditor`; baseline state is in memory |
| `workspace/api-service.tsx` | `workspace/service-nav.tsx`: `ServiceNav`, listing API pages only |
| `workspace/api-dialogs.tsx` | `workspace/remote-page-dialogs.tsx`: `ApiServiceDialog` → `CreateRemoteServiceDialog`, `ApiPageDialog` → `CreateRemotePageDialog`, `DeletePageDialog` → `DeleteRemotePageDialog` |
| `workspace/dialogs.tsx` | Local dialogs removed; shared shell remains in `workspace/workspace-dialog.tsx` |
| Workspace model types only | `PageDocument` and `ServicePageRole`; local service/form models removed, reusable form schema unchanged |
| `api/client.ts` input types | `NewPage` → `CreatePageInput`, `SaveFields` → `SavePageInput`; transport method `EditorApi.savePage` unchanged |
| `api/page-markdown.ts` save conversion | `SaveFieldsResult` → `PageSaveInputResult`, `markdownToSaveFields` → `markdownToPageSaveInput` |
| `api/queries.ts` | `versionQuery` → `estateVersionQuery`; polling keys and timing unchanged; `historyQuery` removed |
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

Old browser draft/workspace/baseline/journal records are intentionally ignored, never migrated or cleaned up. Routes, API/schema contracts and app/package/Nx names remain unchanged. Locking, webhooks, server autosave and publication architecture are deferred.

Historical probes such as `rb4.mjs`, `step3-ui.mjs`, `step5-ui.mjs` and other numbered browser scripts are deferred pending confirmation of their use. They and legacy fixtures are not renamed or counted as passing regression checks.

## Known issues

- The Other switch can disagree with the option after that option is deleted. An ordinary Other choice with a conditional follow-up is available.
- Selecting Custom for a time increment does not retain a separate custom mode; the seconds editor remains visible.
- Checks for missing declaration or confirmation pages navigate to page 1 rather than the relevant insertion point.
- Require answer can target a field that is already required without a useful warning.
- Advanced → Internal alias can be edited in memory, but native JSON export rejects the `name` setting. Use the visible question label in logic selectors until aliases have a native mapping.
- The loud-music demo requires both National ID and passport even though its Details text presents them as alternatives. Its definition needs conditional requirements; the documented demo and example test currently preserve that behavior.

Address lookup and opening hours provide authoring examples, not live integrations. Calculator fixtures are regression data: NIS prototype rates have not been verified for production use, and severance cases use explicit complete-years and end-year inputs.
