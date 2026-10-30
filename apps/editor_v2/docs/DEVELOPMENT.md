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

Categories follow [ADR 0078](../../../docs/decisions/0078-category-write-rules.md). One `categoriesQuery` reads `GET /editor/categories` for the Categories screen, Services filters, page settings and Create service. Filters use current category labels even when no services are filed under them, with service-derived labels while the category read is unavailable. The address keeps category slugs, not titles. `createEditorApi`'s category methods return a `CategoryResult` instead of throwing, with a tagged failure for each refusal and `CategoryOutcomeUnknown` for a write whose answer was lost or was a 5xx. Edits and deletions send the version their dialog opened with; a move sends its whole sibling group's versions, one move at a time per group. A dialog keeps its category and typed input through refreshes, conflicts and deletion; a lost answer is checked against an independent API read before anything is sent again. These checks do not join, retry or pause with the shared query, and another sibling group's write cannot cancel them. Confirmed writes invalidate `["content"]`. Category writes don't move `/version` until trigger-based change events land, so another session sees them on its next read.

Only the sign-in button starts OAuth. Initial admission and callback checks use contextual entry pending views; content preloads remain non-blocking, and the router has no blanket full-page loading component. `LoadingState` shows its label visibly and announces it once. Lists and page panes handle their own first-load and refresh states: transient network/5xx failures retain usable data, while session/access/deletion failures remain explicit without silently discarding open drafts. Unexpected route failures offer an app-owned retry, not a document reload.

## Browser checks

Start the app, then run the browser suites against the same URL. The full suite includes site preview: also build/start landing and set `VITE_SITE_PREVIEW_URL` in the CMS and test-process environments as described in [Site preview](SITE-PREVIEW.md). Its normal-page reference defaults to `http://127.0.0.1:3040`:

```sh
PLAYWRIGHT_MODULE_PATH=/path/to/playwright-core \
  pnpm exec node scripts/browser/run.mjs http://localhost:3000/
```

The runner resolves an existing `playwright` or `playwright-core` installation, with `PLAYWRIGHT_MODULE_PATH` as an alternative. Chromium must be available to that installation. Each suite uses an isolated browser context.

App UI suites supply employee/API responses at the HTTP boundary. `authentication.mjs` covers explicit sign-in, duplicate activation, delayed session/callback checks, deep-link return paths, outages, sign-out and cancelled expiry without revoking auth prematurely. It also captures transient framework-error screens and uncaught errors. Reusable form and page-canvas suites use `buildBrowserFixture` and `tests/browser/editor-host.tsx`, intercepted only by Playwright—not a production route. `openDemoForm` and `seedFormSource` supply explicit source; `reloadEditorFromSource` explicitly exports and reopens it to test conversion. A normal reload restores only fixture input. No production draft-storage seeding is needed. Real GitHub consent/cookies still require a deployment smoke test.

`remote-page-editing.mjs` checks explicit saves, version conflicts, undo/redo, safe preview links, the absence of saved-version restore controls or background history requests, and API reloads. Read-only page history is a separate screen; `service-workspace.mjs` checks API creation/deletion and holds list/service/page/category responses to verify contextual loading without remounting the header. Run the auth and service-workspace suites against both development and production-built `dist/client` served with the documented `/_shell.html` rewrite; keep auth bypass off for these checks. `routing.mjs` checks cancelled links/Back/Forward, reload/tab-close warnings and clean-view eviction. `persistence-isolation.mjs` seeds malformed old keys and proves editing/lifecycle events neither read nor write them.

`categories.mjs` answers `/editor/categories` with a versioned fixture at the HTTP boundary. It checks loading, versioned keyboard moves with focus and announcements, app-route and in-use locks, refused slugs, renamed-category service links by slug, unmatched bookmark filters, the shared Create service and page settings pickers, a failed load and Try again, long names, and the 390px drawer and row menu. Touch contexts check 44px targets; fine-pointer geometry is not evidence of touch size.

`collections.mjs` answers api_v2's `/collections` routes with a versioned fixture at the HTTP boundary. It reaches Collections from the menu by keyboard, opens a collection's table and a record's dialog from its row, checks `?record=` in the address, a field refused by `validation_failed`, the stale-save choices, keyboard add and delete with focus returned, visible focus at each stop, and the table at 390px. Screenshots go to `/tmp/c3184-collections-*.png`.

`categories-live.mjs` is opt-in and never in the default list. It writes to a real api_v2 over a disposable database, with nothing intercepted. Follow the [API local setup](../../api_v2/README.md#run-locally), using that database, `SEED=false`, `AUTH_BYPASS=true`, `PORT=43107`, `BETTER_AUTH_URL=http://127.0.0.1:43107` and `EDITOR_ORIGIN=http://localhost:43108`. Start the editor in a separate terminal, then run the suite from this directory:

```sh
VITE_AUTH_BYPASS=true VITE_API_ORIGIN=http://127.0.0.1:43107 \
  pnpm exec vite dev --port 43108 --host localhost

# In another terminal, using an existing Playwright/Chromium installation:
PLAYWRIGHT_MODULE_PATH=/path/to/playwright-core \
  pnpm exec node scripts/browser/run.mjs http://localhost:43108 categories-live.mjs
```

Two browser contexts add, rename and order categories, reload, make a stale save, file a real service so a deletion is refused, and delete an empty category. They are two clients of the same bypass identity, not distinct authenticated employees. Screenshots go to `/tmp/c3107-categories-live-*.png`; uniquely named categories and draft services remain in the disposable database. Run mutation suites serially. Keep fixture and auth suites on a separate dev server with bypass off.

The live editor suite does not publish a page or prove landing propagation: landing integration is tracked in #3179 and sandbox acceptance in #3180.

Pass suite names after the URL to run a subset:

```sh
pnpm exec node scripts/browser/run.mjs http://localhost:3000/ page-writer.mjs service-workspace.mjs
```

Avoid editing source while checking undo and document switching: a development reload can reset in-memory editor history. The insertion/undo regression starts on a question page because confirmation pages reject answer insertion.

## Editable site preview checks

[Site preview](SITE-PREVIEW.md) documents the landing renderer build, `VITE_SITE_PREVIEW_URL`, local two-app setup and production asset delivery. `scripts/browser/site-preview.mjs <cms-url> [landing-url]` uses the actual authenticated route with API fixtures to verify editing/history, matched public-page rendering, style lifecycle, error recovery and explicit publication. Run it against development and production-built CMS output. `site-preview-parity.mjs <landing-url>` separately compares the fresh renderer to the ordinary mentor page.

The page-writer fixture builds its own bundle, so pass `VITE_SITE_PREVIEW_URL` to the browser-test process as well as the dev server. Keep the normal landing reference available while running these suites. Real deployment headers, sign-in, assistive technology and phone IME still need manual checks; synthetic composition and narrow viewports are not substitutes.

The existing TypeScript configuration does not enable `exactOptionalPropertyTypes`. A strictness probe still fails across legacy converters, form controls and test fixtures (for example, `sourceKey: undefined` in `form-markdown-to-lexical.ts` and `config: undefined` in `check-native-form-coverage.ts`). Migrating those contracts is separate from page editing; the required project typecheck remains the verification gate.

## Real-API concurrent editing check

`concurrent-page-editing.mjs` runs two employees and same-user tabs against real Fastify and isolated PostgreSQL, rather than HTTP fixtures. It covers takeover, stale writes, ordinary heartbeat loss detection, confirmed reloads without version choices, idle response/expiry, auth-expiry exports and guarded deletion of unsupported content. `apps/api_v2/browser/page-edit-locks.test.ts` owns the temporary API and database and tears both down; its test-only clock controls are not production routes.

Start the editor with `VITE_API_ORIGIN=http://127.0.0.1:3038`, auth bypass off, and a working site preview. Start landing at `127.0.0.1:3048` and set `VITE_SITE_PREVIEW_URL=http://127.0.0.1:3048/cms-preview/`. Then run from the repo root, with an isolated PostgreSQL server and Chromium installed for the editor’s pinned Playwright dependency:

```sh
DB_HOST=127.0.0.1 DB_PORT=55438 \
pnpm --dir apps/editor_v2 exec node scripts/browser/run.mjs \
  http://127.0.0.1:3018/ concurrent-page-editing.mjs
```

CI’s **Editor v2 concurrent editing** job runs this same real-API scenario with PostgreSQL 17, dummy cookie sessions, auth bypass off and the local landing renderer. It fails if no test executed or any test failed, skipped or remained todo. The job also runs the mocked API-first release-gate tests. The editor declares the existing locked Playwright version directly; `PLAYWRIGHT_MODULE_PATH` remains available for another installed copy. Missing browser/database prerequisites are failures, not successful skips.

The runner forwards the editor URL and starts the API at port 3038. Do not point this scenario at a deployed database. Keep running `remote-page-editing.mjs`, `routing.mjs` and `service-workspace.mjs` alongside it. If the full editor Vitest run exhausts local workers, `pnpm exec nx run editor_v2:test -- --maxWorkers=4` limits concurrency without skipping tests.

When running `site-preview.mjs`, its optional second URL chooses the ordinary landing reference. Otherwise it uses the origin of `VITE_SITE_PREVIEW_URL`, then the original localhost:3040 default. Keep the preview assets and reference page on the same local landing build.

Release ordering and safe rollback are documented in [API-first release and rollback](../../api_v2/README.md#api-first-release-and-rollback).

## Persistence and recovery

Unsaved edits exist only in memory. Save/Publish validates and sends the applied snapshot with the baseline's numeric `version` and the acquisition's `X-Page-Edit-Lock-Token`. A successful response acknowledges only the submitted snapshot, not edits made while waiting. The numeric counter is an internal stale-write guard, not an author-facing version workflow. Background reads never attach fresh write evidence to old content. A new lock requires a fresh page read before editing is enabled.

Network/auth failures and lock loss retain the same store, including unapplied or invalid source and failed canvas serialization. After reacquiring a lock, a stale-write refusal or an uncertain save, the author reloads the saved page before editing again. Unsaved work stays read-only until the author confirms discarding it, with source and recovery downloads available. A failed or superseded reload leaves it untouched. A successful reload replaces discarded content and clears its undo history; it never resubmits old edits. There are no version choices, comparisons, autosave, durable drafts, crash/reload recovery or merging.

Apply is not Save. Invalid/unapplied source and serialization errors also count as unsaved work. Cancelled navigation/sign-out retains edits and undo. Pending saves block departure. A crash, refresh, closed tab or confirmed departure loses unsaved work; unload warnings are best-effort, not recovery.

The sidebar preference `govbb-editor:sidebar-collapsed` and clipboard storage remain. Old `govbb-editor:draft*`, `documents:*`, form/workspace and server-baseline records are left untouched and never loaded.

API types in `src/api/openapi.d.ts` come from `apps/api_v2/openapi.json`; regenerate after an API spec change with `pnpm exec vitest run src/api/openapi.test.ts -u`.

Native IDs, answer keys, option values and Markdown anchors remain distinct. Imports validate before Apply and retain failed input in memory. See [Converters](CONVERTERS.md).

## Source import migration

The naming refactor changes repository source paths and symbols, not HTTP APIs or saved data. Existing barrel paths (`src/editor`, `src/forms`, `src/pages`, `src/host`) remain. No tracked source consumers were found outside this app; unknown external source consumers must update their imports using the map below. No blanket compatibility aliases were added.

Paths below are relative to `src`. Symbols not listed as renamed keep their names.

| Previous source | Current source |
| --- | --- |
| `workspace/api-pages.ts` synchronization | `workspace/page-sync.ts`: `PageEditBaseline`, `PageSaveOutcome`, `savePageChanges`; browser baseline storage/seeding helpers removed |
| `workspace/api-pages.ts` service mapping | `workspace/service-pages.ts`: `apiPageDocument` → `pageDocumentFromApi`, `roleOf` → `inferServicePageRole`; local `serviceDocuments` joins removed |
| `workspace/api-pages.ts` Markdown helpers | `api/page-markdown.ts`: `fieldLabel` → `pageFieldLabel`; `restoredMarkdown` removed with saved-page history |
| `workspace/api-page.tsx` | `workspace/remote-page-pane.tsx`: `RemotePagePane`, private `RemotePageEditor`; baseline state is in memory |
| `workspace/api-service.tsx` | `workspace/service-nav.tsx`: `ServiceNav`, listing API pages only |
| `workspace/api-dialogs.tsx` | `workspace/remote-page-dialogs.tsx`: `ApiServiceDialog` → `CreateRemoteServiceDialog`, `ApiPageDialog` → `CreateRemotePageDialog`, `DeletePageDialog` → `DeleteRemotePageDialog` |
| `workspace/dialogs.tsx` | Local dialogs removed; API dialogs use `ui/form-dialog.tsx` and `ui/confirm-dialog.tsx` |
| Workspace model types only | `PageDocument` and `ServicePageRole`; local service/form models removed, reusable form schema unchanged |
| `api/client.ts` input types | `NewPage` → `CreatePageInput`, `SaveFields` → `SavePageInput`; transport method `EditorApi.savePage` unchanged |
| `api/page-markdown.ts` save conversion | `SaveFieldsResult` → `PageSaveInputResult`, `markdownToSaveFields` → `markdownToPageSaveInput` |
| `api/queries.ts` | `versionQuery` → `estateVersionQuery`; polling keys and timing unchanged; the saved-version `historyQuery` was removed, and `historyQuery` now reads the read-only page history (`GET /pages/{id}/history`) |
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

Old browser draft/workspace/baseline/journal records are intentionally ignored, never migrated or cleaned up. App/package/Nx names remain unchanged. The page API now requires numeric versions and edit-lock credentials; see [API concurrency and rollout](../../api_v2/README.md#concurrent-editing). Deploy enforcing API instances and drain old ones before the editor. Old tabs must export unsaved work before refreshing. An editor rollback must not relax backend enforcement. Webhooks, server autosave and publication redesign remain out of scope.

Historical probes such as `rb4.mjs`, `step3-ui.mjs`, `step5-ui.mjs` and other numbered browser scripts are deferred pending confirmation of their use. They and legacy fixtures are not renamed or counted as passing regression checks.

## Known issues

- The Other switch can disagree with the option after that option is deleted. An ordinary Other choice with a conditional follow-up is available.
- Selecting Custom for a time increment does not retain a separate custom mode; the seconds editor remains visible.
- Checks for missing declaration or confirmation pages navigate to page 1 rather than the relevant insertion point.
- Require answer can target a field that is already required without a useful warning.
- Advanced → Internal alias can be edited in memory, but native JSON export rejects the `name` setting. Use the visible question label in logic selectors until aliases have a native mapping.
- The loud-music demo requires both National ID and passport even though its Details text presents them as alternatives. Its definition needs conditional requirements; the documented demo and example test currently preserve that behavior.

Address lookup and opening hours provide authoring examples, not live integrations. Calculator fixtures are regression data: NIS prototype rates have not been verified for production use, and severance cases use explicit complete-years and end-year inputs.
