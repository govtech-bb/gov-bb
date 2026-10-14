# Editor v2 naming and folder-organization plan

## Context

Improve discoverability in **`apps/editor_v2` first; review `apps/api_v2` separately later**. This is a naming/organization refactor, not a framework, persistence, or architecture rewrite. Preserve behavior, public URLs, HTTP contracts, and stored-data formats.

The recommendations below are based on local implementations/callers and actual source from OpenStory, TanStack.com, and OpenStatus, not just their READMEs.

### What the code does

- The app is a private workspace package, `@govtech-bb/editor-v2`; its folder, Nx project, and root dev script instead use `editor_v2`.
- It uses TanStack Start in SPA mode, file-based routes, React, and Lexical. The content/auth API is a separate `apps/api_v2` application.
- The existing separation into `editor`, `forms`, `pages`, `workspace`, `api`, `auth`, `persistence`, and `presets` is documented and boundary-checked. Keep it: the editor kernel is form-independent; persistence is storage-independent; the host owns browser effects; the workspace owns service/document sessions.
- `docs/ARCHITECTURE.md` explicitly calls source entry points repository APIs, not separately published packages. Their examples and extension tests are compatibility checks, not evidence of an external published SDK.
- The workspace supports both browser-local services/forms/pages and content-API services/pages. Names must retain that distinction: dropping every `Api` prefix without replacing its meaning would hide real differences.
- `api-page.tsx` opens and keeps a content page's draft session; `api-service.tsx` renders service-page navigation; `api-history.tsx` renders saved-page history; `api-dialogs.tsx` creates services/pages and deletes pages through the API. None is an API endpoint.
- `src/workspace/api-pages.ts` is not an API route module: it reconciles a server page with browser drafts, saves with optimistic concurrency, maps service pages to workspace documents, labels validation fields, and prepares restored versions. Its name hides several distinct responsibilities.
- Existing untracked `PLAN.md` and `plans/review-pr-3033.md` belong to other work and will not be changed.

## Approach

Recommend the smallest justified renames and targeted moves. Keep good names, framework-mandated names, and deliberate domain boundaries. Distinguish code identifiers from serialized values, public routes, and external deployment identifiers.

### Scope decisions

- User confirmed: keep `apps/editor_v2`, Nx `editor_v2`, and `dev:editor_v2` exactly as they are. Keep package `@govtech-bb/editor-v2` too; the spelling difference is accepted, not a refactor target.
- Latest scope decision: **editor first, API later**. Read `apps/api_v2` to validate vocabulary and contracts, but do not bundle backend renames into these implementation phases. Record backend questions as a separate future review. Legacy `apps/api` and unrelated workspace packages are out of scope.
- Repository search found no tracked consumers of editor source outside the editor itself. Its private package declares no package entry point or exports map. Update verified internal imports directly, including documentation examples and extension fixtures. External source consumers remain unverified; see the non-blocking compatibility caveat below. Keep the documented barrel paths (`src/editor`, `src/forms`, `src/pages`, `src/host`, etc.).

### Short naming convention

- Keep current owners (`editor`, `forms`, `pages`, `workspace`, `api`, `auth`, `host`, `persistence`, `presets`, `ui`); no new architectural hierarchy. `pages` means authored service content, `forms/features/pages` means pages within a form, and `routes` means application URLs.
- Use kebab-case for ordinary TS/TSX filenames and folders, PascalCase for components/types, camelCase for functions/hooks, `use-…` hook filenames. Preserve framework spellings (`__root.tsx`, `_workspace…`, `$serviceId`, `routeTree.gen.ts`) and the user's existing app identifiers.
- Prefer domain + responsibility: `page-sync.ts`, `page-history-dialog.tsx`, `FormJsonDialog`, `savePageDraft`. A name should reveal both what it handles and what it does.
- Use `remote`/`local` where the distinction affects behavior. Reserve API naming for real transport/contracts, not every UI that happens to use them. Do not call browser code `.server.ts` because its data came from a server.
- Name conversions by source and destination, including the form/page distinction: `lexicalToFormMarkdown` versus `lexicalToPageMarkdown`.
- Keep concise conventional primitives and established extension vocabulary (`Button`, `cn`, `EditorModule`, `DraftStore`, `$create…` Lexical helpers). Do not mass-prefix every leaf or rename existing feature role files just for uniformity.
- Keep thin public barrels and existing test placement. Flatten one-file converter directories, not meaningful feature directories. Preserve `native`, `legacy`, and `V2` where they distinguish real supported formats.

### Old → proposed → reason

Paths in the following tables are relative to `apps/editor_v2/src`. Rows are recommended changes unless marked **keep** or **defer**.

#### Workspace and API integration

| Old path/name | Proposed path/name | Actual responsibility / reason |
| --- | --- | --- |
| `workspace/api-pages.ts` | `workspace/page-sync.ts`, with the extractions below | Keep browser/server baseline reconciliation and optimistic draft saving together. It is neither a route nor a transport client. |
| `api-pages.ts`: `ServerBase`, `SaveOutcome` | `page-sync.ts`: `ServerPageBaseline`, `PageSaveOutcome` | The browser's last loaded/saved server page and the outcome of saving its draft. Keep object properties, discriminants, and serialized bytes unchanged. |
| `serverBaseKey`, `parseServerBase`, `writeServerBase` | `serverPageBaselineKey`, `parseServerPageBaseline`, `writeServerPageBaseline` | Make the domain explicit; **do not** change the `govbb-editor:documents:<id>:server` key or `{ page, markdown }` shape. |
| `seedApiPage`, workspace `savePage` | `seedPageDraftFromServer`, `savePageDraft` | Initialization must preserve unsaved/working drafts; saving validates Markdown and handles concurrency. Leave transport method `EditorApi.savePage` unchanged. |
| `api-pages.ts`: `apiPageDocument`, `serviceDocuments`, `roleOf` | New `workspace/service-pages.ts`: `pageDocumentFromApi`, `servicePageDocuments`, `inferServicePageRole` | These adapt API pages into workspace references/order; they do not save drafts. Preserve existing ordering and fallback role inference exactly. |
| `api-pages.ts`: `restoredMarkdown`, `fieldLabel` | Existing `api/page-markdown.ts`: `pageVersionToDraftMarkdown`, `pageFieldLabel` | Reuse the existing Markdown/API adapter for selective version conversion and API-field presentation. Restoration keeps current path/category/parent/visibility. |
| `workspace/api-page.tsx`: `ApiPagePane`, private `ApiPageEditor` | `workspace/remote-page-pane.tsx`: `RemotePagePane`, `RemotePageEditor` | Opens and maintains an API-backed page draft session; `remote` distinguishes it from browser-local pages. Keep mounted-session behavior. |
| Same file: `useServerBase`, `notifyServerBase` | `useServerPageBaseline`, `notifyServerPageBaseline` | Readers/listeners observe a browser-held server baseline. Keep them in this file; no single-use hook package or new store. |
| `workspace/api-service.tsx`: `ApiServiceNav` | `workspace/service-pages-nav.tsx`: `ServicePagesNav` | Navigation over page-document props; no API access of its own. It does not represent a service API client. |
| `workspace/api-history.tsx`: `PageHistoryDialog` | `workspace/page-history-dialog.tsx`; **keep** `PageHistoryDialog` | Saved-version preview and restore dialog; its existing component name is already accurate. |
| `workspace/api-dialogs.tsx`: `ApiServiceDialog`, `ApiPageDialog`, `DeletePageDialog` | `workspace/remote-page-dialogs.tsx`: `CreateRemoteServiceDialog`, `CreateRemotePageDialog`, `DeleteRemotePageDialog` | Creates a service's entry page, creates child pages, or deletes a page through the API. Does not create a backend service entity. |
| `workspace/dialogs.tsx`: `WorkspaceDialog`, `inputClass` | Extract unchanged shell to `workspace/workspace-dialog.tsx`; keep `WorkspaceDialog`, name class `workspaceDialogInputClass` | Shared shell is used by local dialogs, remote dialogs, and history. Avoid importing local form-creation code merely to render that shell. |
| Remaining `workspace/dialogs.tsx`: `ServiceDialog`, `DocumentDialog` | `workspace/local-document-dialogs.tsx`: `LocalServiceDialog`, `AddLocalDocumentDialog` | Browser-local service creation/rename and document creation/import—not remote writes. Keep all form/page choices and labels. |
| `workspace/model.ts`: `FormDocument`, `PageRole`, `Service` | Same file: `WorkspaceFormDocument`, `ServicePageRole`, `WorkspaceService` | Avoid confusion with the Markdown AST's `FormDocument`, native form `PageRole`, and server service DTOs. Keep `PageDocument`, `WorkspaceDocument`, and all property names. |
| `api/client.ts`: `NewPage`, `SaveFields`; `api/page-markdown.ts`: `SaveFieldsResult`, `markdownToSaveFields` | Same files: `CreatePageInput`, `SavePageInput`, `PageSaveInputResult`, `markdownToPageSaveInput` | These are page-write payload types/conversion, not generic fields. Continue deriving types from unchanged OpenAPI declarations. |
| `api/queries.ts`: `historyQuery`, `versionQuery` | `pageHistoryQuery`, `estateVersionQuery` | Distinguish saved-page history from Lexical undo, and estate change tokens from page/form format versions. Keep query keys, intervals, stale/gc times, and invalidation behavior. |

**Test destinations:** move `tests/workspace/api-pages.test.ts` to `tests/workspace/page-sync.test.ts`; move its service-ordering case to `tests/workspace/service-pages.test.ts` and its restoration case to existing `src/api/page-markdown.test.ts`. Preserve assertions and fixtures. Other tests keep their locations and update imports/types as needed.

#### Converters: flatten only the redundant one-file folders

| Old path/name | Proposed path/name | Reason |
| --- | --- | --- |
| `converters/lexicalToMarkdown/index.ts` / `lexicalToMarkdown` | `converters/lexical-to-form-markdown.ts` / `lexicalToFormMarkdown` | Handles the versioned **form** dialect, not general Markdown or service pages. |
| `converters/markdownToLexical/index.ts` / `markdownToLexical` | `converters/form-markdown-to-lexical.ts` / `formMarkdownToLexical` | Same distinction; retain preparation, migration, and failure semantics. |
| `converters/formSchemaToLexical/index.ts` | `converters/form-schema-to-lexical.ts`; keep function name | A single conversion boundary, not a directory-sized feature. |
| `converters/lexicalToFormSchema/index.ts` | `converters/lexical-to-form-schema.ts`; keep function name | Same; `FormDefinitionV2` remains the custom form contract, not JSON Schema. |
| `converters/lexicalToLegacySsb/index.ts` | `converters/lexical-to-legacy-ssb.ts`; keep function name | `LegacySsb` accurately identifies an explicit compatibility projection. |
| `converters/pageMarkdownToLexical/index.ts` | `converters/page-markdown-to-lexical.ts`; keep export | Remains a thin re-export from `pages/converters.ts`, not a copied implementation. |
| `converters/lexicalToPageMarkdown/index.ts` | `converters/lexical-to-page-markdown.ts`; keep export | Same; preserve page-converter ownership and public `src/pages` barrel. |

#### Small remaining corrections

| Old path/name | Proposed path/name | Reason |
| --- | --- | --- |
| `host/form-schema-ui.tsx` / `FormSchemaEditor` | `host/form-json-dialog.tsx` / `FormJsonDialog` | Downloads or stages a FormDefinitionV2 JSON file; its textarea is read-only. It is not a schema designer or general JSON editor. |
| `forms/editor/codec.ts` / `createDraftCodec` | Keep file; `createFormDraftCodec` | Requires `FormRuntime` and uses only the form dialect. Pairs accurately with existing `createPageDraftCodec`. |
| `ui/table/hook.ts` | `ui/table/table-hooks.ts`; keep exports | Creates the app table hook and related cell/header/context hooks; `hook` alone hides which hooks. Update sibling component imports too. |

No new `features/`, `lib/`, `services/`, `repositories/`, or workspace package is needed. Most directories stay exactly where they are; the only folder removal is the seven one-file converter directories.

### Reference evidence and what fits here

Source trees and representative implementations were inspected at the immutable revisions linked below. These projects do **not** share a universal casing or folder convention.

| Reference | Actual code inspected | Borrow / comparison with our app |
| --- | --- | --- |
| **OpenStory** (`d3541fdc`) | Domain roots such as `sequences`, `cast`, `billing`, `shots`, with `ui/`, `server/`, and `.fn.ts` files. The [history route](https://github.com/openstory-so/openstory/blob/d3541fdc566d7bd4e2953a1b097a6b14f772e23e/src/routes/_app/sequences/$id/history.tsx) delegates to `HistoryPage`; [sequences.fn.ts](https://github.com/openstory-so/openstory/blob/d3541fdc566d7bd4e2953a1b097a6b14f772e23e/src/sequences/sequences.fn.ts) exports `getSequencesFn`/`createSequenceFn` using `createServerFn` and delegates writes to domain server modules; [public-styles-query.ts](https://github.com/openstory-so/openstory/blob/d3541fdc566d7bd4e2953a1b097a6b14f772e23e/src/look/ui/public-styles-query.ts) holds reusable query options. | Borrow **domain + responsibility** filenames and real ownership boundaries. Our `forms`, `pages`, `workspace`, and shared `ui` already provide them. Keep routes separate from draft orchestration. Do not introduce its server-function/Cloudflare architecture into our static SPA. Its README still shows the older `components/functions/lib` layout; that is not the inspected source layout. |
| **TanStack.com** (`de92ae26`) | [queries/docFeedback.ts](https://github.com/TanStack/tanstack.com/blob/de92ae269f906a0ba27e0b6c0fe463e61587a031/src/queries/docFeedback.ts) defines `getUserDocFeedbackQueryOptions`; [docFeedback.functions.ts](https://github.com/TanStack/tanstack.com/blob/de92ae269f906a0ba27e0b6c0fe463e61587a031/src/utils/docFeedback.functions.ts) contains Start server functions; [docFeedback.client.ts](https://github.com/TanStack/tanstack.com/blob/de92ae269f906a0ba27e0b6c0fe463e61587a031/src/utils/docFeedback.client.ts) contains DOM operations. Its [account feedback route](https://github.com/TanStack/tanstack.com/blob/de92ae269f906a0ba27e0b6c0fe463e61587a031/src/routes/account/feedback.tsx) uses those query options and PascalCase-named components. | Borrow **explicit operation/domain names and runtime distinctions**; reuse our existing `api/queries.ts` rather than add another query layer. Keep TanStack route syntax and generated files. It mixes PascalCase components, camelCase files, and kebab-case files: retain our existing kebab-case convention instead of imposing its spelling choices. No blanket `.client`/`.server` suffix rollout. |
| **OpenStatus** (`32527be7`) | [dashboard/package.json](https://github.com/openstatusHQ/openstatus/blob/32527be753c192206efed04729dc2d7accb515de/apps/dashboard/package.json) runs **Next.js**; [server/package.json](https://github.com/openstatusHQ/openstatus/blob/32527be753c192206efed04729dc2d7accb515de/apps/server/package.json) runs Deno with **Hono** and ConnectRPC dependencies. A [monitor page](https://github.com/openstatusHQ/openstatus/blob/32527be753c192206efed04729dc2d7accb515de/apps/dashboard/src/app/%28dashboard%29/monitors/%28list%29/page.tsx) composes server query hydration and a colocated client. [packages/services/src/page/index.ts](https://github.com/openstatusHQ/openstatus/blob/32527be753c192206efed04729dc2d7accb515de/packages/services/src/page/index.ts) explicitly exports operations and input types; [packages/api/package.json](https://github.com/openstatusHQ/openstatus/blob/32527be753c192206efed04729dc2d7accb515de/packages/api/package.json) is a distinct shared API package. | Borrow **deployable-app versus reusable-package boundaries**, explicit operation/input names, and thin entry points. Our editor and Fastify API should remain separate apps. OpenStatus is not a TanStack Start template; do not copy Next route filenames, RPC transport, backend layers, or create packages just to resemble its monorepo. Its `data/status-pages.ts` is sample data and `status-pages.client.ts` supplies UI actions—not evidence that every `data` file is an API loader. |

### Good names and workspace packages to keep

- Keep `src/editor`, `src/forms`, `src/pages`, `src/workspace`, `src/api`, `src/auth`, `src/host`, `src/persistence`, `src/presets`, and `src/ui`. `host` means browser/application binding, not HTTP hosting; document that meaning rather than rename its public entry point.
- Keep `api/client.ts`, `api/queries.ts`, `api/page-markdown.ts`, `EditorApi`, `ApiPage`, `ServiceSummary`, `ServiceDetail`, `PageSnapshot`, `PageVersion`, and `createEditorApi`: here API naming accurately denotes transport/contracts.
- Keep `ServiceWorkspace`, `ServicesList`, `WorkspaceRepository`, `DraftStore`, `PageDraftEditor`, `WorkspaceFormEditor`, `FormDefinitionV2`, `defineEditor`, `defineFormEditor`, and `definePageEditor`.
- Keep meaningful feature folders and their established `module.ts`, `definition.ts`, `controls.tsx`, and `presentation.tsx` roles. Do not rename hundreds of leaves or relocate tests for cosmetic consistency.
- Keep `native-*`, `legacy-*`, `adapters/ssb`, schema versions, and frozen migration fixtures. The code really supports distinct form representations and compatibility paths.

| Existing path/package | Decision | Reason |
| --- | --- | --- |
| `apps/editor_v2`, Nx `editor_v2`, root `dev:editor_v2`, `@govtech-bb/editor-v2` | **Keep all four** | Explicit user decision. No deployment/build-root rename. |
| `apps/api_v2`, `@govtech-bb/api-v2` | **Keep; later review only** | Separate backend and outside this implementation. |
| `packages/form-builder`, `packages/form-types`, `packages/registry`, `packages/content` and their `@govtech-bb/*` names | **Keep** | Not editor-v2 dependencies to reorganize. Similar vocabulary does not make them replacements for editor-local modules. No workspace-package extraction or consolidation. |
| `@govtech-bb/frontend` | **Keep** | Published, version-pinned UI/assets dependency, not a workspace package owned by this refactor. |

The editor manifest has no direct `workspace:*` dependency. No package name, package exports map, pnpm workspace glob, dependency version, lockfile, or TypeScript project-reference change is needed.

### Uncertain/deferred cases

- **Outside source consumers:** none found in tracked code, but private does not prove nobody imports source elsewhere. Source-symbol/path changes must be listed in the migration note. If an actual external consumer is identified before the converter/host phase, update it with the rename or retain narrowly scoped deprecated re-exports; do not silently break it or build a blanket compatibility layer. HTTP API contracts remain unchanged regardless.
- **Historical browser probes:** `scripts/browser/rb4.mjs` drags a selection and prints its count; a descriptive name would be `rubber-band-selection-probe.mjs`. `step3-ui.mjs` probes National ID/date/Parish controls (`field-presets-probe.mjs`); `step5-ui.mjs` probes repetition drawing/settings (`repetition-controls-probe.mjs`). These bypass the current auth fixture and are not in the default runner; their ongoing use is unknown. **Defer these renames/moves and the other numbered scripts** until their status is confirmed. Do not present console-only probes as passing regression tests, delete them, or rename `legacy-step9` data by association.
- Do not move the mixed legacy/native form internals into a new hierarchy or standardize every `model`, `settings`, or `presentation` name without a demonstrated ambiguity. That would exceed this targeted plan.

## Files to modify

Only this plan file is being changed now. After approval, the critical implementation files are:

- The source paths in the rename tables, plus their callers in `src/workspace/workspace.tsx`, `src/workspace/documents.ts`, `src/workspace/validation.ts`, `src/workspace/form-editor.tsx`, `src/presets/govbb-form.ts`, `src/forms/index.ts`, `src/forms/legacy.ts`, `src/host/index.ts`, `src/host/native-form-io.ts`, and the table component siblings. Search for all import/re-export/dynamic-import references, not just these examples.
- `tests/workspace/*`, `src/api/{client,queries,page-markdown}.test.ts`, affected `tests/forms/*`, `tests/compatibility/*`, `tests/host/*`, `tests/helpers/*`, `tests/browser/*`, `tests/extensions/*`, and `docs/examples/*`. Add one focused `scripts/browser/remote-page-editing.mjs` scenario using the existing browser harness and register it in `scripts/browser/run.mjs`.
- `.oxlintrc.json` (exact converter path and `api-pages.ts` validation exceptions), `scripts/check-boundaries.ts`, `scripts/check-boundaries.test.ts`, and converter imports in `scripts/check-native-form-coverage.ts`. Keep the same permissions and negative boundary assertions; do not broaden allowlists to hide rename errors.
- `docs/TERMINOLOGY.md` (add technical vocabulary alongside product terms), `docs/ARCHITECTURE.md`, `docs/CONVERTERS.md`, `docs/DEVELOPMENT.md`, `docs/CODE-QUALITY.md` where affected, and ADR source links in `docs/decisions/0002-use-a-native-form-json-contract.md` and `0003-preserve-editable-drafts-in-markdown.md`. Update links/examples, not historical decision rationale.

**Configuration audit, expected no edits:** `package.json` scripts/Nx inputs, `tsconfig.json`, `vite.config.ts`, `vitest.config.ts`, `.oxfmtrc.json`, root `package.json`, `pnpm-workspace.yaml`, `nx.json`, `.prettierignore`, `.github/workflows/ci.yml`, and `amplify.yml`. Existing globs cover the new paths; CI invokes Nx names and Amplify uses `apps/editor_v2/dist/client`, all unchanged. Oxfmt already excludes generated OpenAPI/route files and frozen fixtures; preserve those exclusions. The browser fixture builder bundles the supplied entry with Vite and needs no new path-resolution mechanism. Use existing relative imports; no alias or tsconfig-path expansion is needed.

**Must not change:** `apps/api_v2/**`, `src/api/openapi.d.ts`, public routes/route IDs, `src/routeTree.gen.ts` by hand, CSS/UI copy, frozen data/goldens, stored keys, package identifiers, or dependencies.

### API follow-up (not part of this implementation)

The paired `apps/api_v2` is a private Fastify/Drizzle application with pure `modules`, use-case `services`, outbound `adapters`, and inbound `routes`. Source tracing confirms:

`src/modules/estate-services.ts` (`groupServices`, `serviceAt`) → `src/services/editor-index.ts` (`EditorIndex`) → `src/routes/pages.ts` (`editorRoutes`) → editor `src/api/client.ts` → `src/api/queries.ts` → workspace.

A remote service is a categorised entry page plus descendants grouped by `parent_id`; its id is the entry page's id. `editorRoutes` also serves services, taxonomy, version and history, not only page writes. This is a legitimate future naming question for the API's `routes/pages.ts`, but **not an editor-phase rename**. Preserve `/pages`, `/services`, `/taxonomy`, `/version`, auth routes, payload names and concurrency headers. A later API review should inspect its module names and ownership independently; no backend directory/package rename or shared-contract-package extraction is authorized here.

## Reuse

- `src/api/client.ts`: existing transport and API types; do not create a parallel API abstraction.
- `src/api/page-markdown.ts`: existing page/API-to-Markdown conversion, already used by `workspace/api-pages.ts`.
- `src/workspace/model.ts`: existing document model, `WorkspaceRepository`, and draft-key generation. `Service` is a browser-local workspace grouping, not an API service DTO. Types/properties and literals must not be conflated.
- `src/forms/editor/codec.ts`, `src/pages/converters.ts`: existing form/page codec implementations; rename only where needed, do not replace conversion logic.
- `src/host/native-form-io.ts`: staged JSON import/export and recovery already exist; the dialog rename must continue using them.
- `src/workspace/dialogs.tsx`: reuse `WorkspaceDialog` and its input class, extracting them unchanged into `workspace-dialog.tsx`. Remote dialogs/history should not import the local document-creation module just to obtain a dialog shell.
- `scripts/browser/auth-fixture.mjs` and `run.mjs`: reuse the existing authenticated browser harness. Inspection found session and services-list stubs, but no remote page-save/history HTTP scenario; do not claim the local service-workspace suite verifies those flows.
- `tests/workspace/api-pages.test.ts`: existing coverage for untouched/unsaved/working drafts, optimistic save failures, service ordering, and selective history restoration. Move assertions with their owners, rather than rewriting expectations.
- `scripts/check-boundaries.ts`: converter permissions are keyed to exact paths. Flat converter filenames require updating those entries and their negative tests, not widening the dependency rules.
- `docs/TERMINOLOGY.md`, `docs/CONVERTERS.md`, and the fixture preservation guides already define form/page meanings. Extend them, rather than create a competing glossary or regenerate examples for a naming-only change.

## Steps

Each phase is independently reviewable. Include its imports, tests, affected configuration entries, and documentation in the same phase; do not leave broken references for a later cleanup.

- [x] **1. Record the baseline and preservation checks.** Run current editor checks; record pre-existing failures. Add the concise naming/vocabulary guidance to existing docs. Reuse page-sync tests and add literal-key/unchanged-shape assertions where current tests only call the key helper. Add one authenticated remote-page browser scenario for open/edit/save, stale-version conflict, history restore, and reload using intercepted API responses. No production behavior changes. **Verify:** the scenario and current format-preservation tests pass before renaming.
- [x] **2. Clarify page synchronization and API-facing symbols.** Apply the `api-pages.ts` split into `page-sync.ts`, `service-pages.ts`, and the existing Markdown adapter; rename baseline/save/helper symbols, page-input aliases, query exports, and the colliding workspace types. Move existing test cases with their owners and update lint/boundary references. **Verify:** API client/query/Markdown and workspace tests, typecheck, lint, boundary checks, and the remote-page scenario pass; no request body, storage shape, query key, or role logic changes.
- [x] **3. Rename workspace UI by purpose.** Rename the four `api-*` UI modules, local dialog module, and components; extract the unchanged `WorkspaceDialog` shell. Keep session/store creation, listeners, mounting, navigation blocking, and UI text unchanged. Rename `ui/table/hook.ts` with all sibling imports. **Verify:** workspace/services-list tests and browser routing, remote-page, local service-workspace, and authentication scenarios; no route-tree/URL changes.
- [x] **4. Clarify conversion and JSON authoring names.** Flatten all seven converter directories, qualify form-Markdown converter names and `createFormDraftCodec`, and rename the JSON dialog. Update all barrels, presets, imports, test helpers, browser/extension fixtures, coverage scripts, exact-path boundary/lint configuration, converter tables, and ADR links. **Verify:** full editor tests plus compatibility/extensions, native-form JSON, source editing, page writer, coverage, and boundary checks. Existing JSON/Markdown goldens remain unchanged.
- [x] **5. Complete the reference sweep and end-to-end verification.** Check every old path/symbol, docs link, script, and configuration reference; record deferred probes and source-consumer caveats. Confirm no package, backend, URL, generated-contract, serialized-data, or dependency churn. Run the final editor gates and monorepo build below. **Verify:** report commands/results and any pre-existing or environment-blocked checks, rather than treating skipped checks as passes.

## Verification

No builds, tests, generators, installs, or browser writes are run during planning. These commands are for the approved implementation.

### Automated gates

From the repository root (Node 24, existing pnpm dependencies):

```sh
VITE_API_ORIGIN=https://api.example.gov.bb pnpm exec nx run-many -p editor_v2 -t build test typecheck lint format:check check:boundaries check:coverage
VITE_API_ORIGIN=https://api.example.gov.bb pnpm exec nx run-many -t build --exclude=landing
```

The HTTPS origin is a shell-build configuration value; the static build does not need to contact that API. Local `landing` builds fetch a live forms API, hence the documented exclusion. A full monorepo test run is optional when its PostgreSQL prerequisites are available; the touched editor's full test suite is required.

- Run `src/api/openapi.test.ts` through the normal test suite **without `-u`**: generated editor types must still match unchanged `apps/api_v2/openapi.json`. Never regenerate snapshots to make this refactor pass.
- Preserve form JSON/Markdown golden files, page-corpus hashes, extension capability coverage, exact source-only bytes, and old migration/replacement fixtures. Moving tests must not reduce their case count or weaken assertions.
- Check boundary tests still reject browser globals in pure synchronization/conversion modules and router imports outside workspace UI. Flat filenames must not lose their special-case enforcement.
- Search all tracked files for old paths/names, including string imports, test fixture builders, lint exceptions, coverage scripts, and Markdown links. Remaining old spellings must be intentional migration notes, this plan, historical records, or explicitly deferred scripts—not live imports.

### Browser and contract checks

Start the editor with `pnpm dev:editor_v2`. From `apps/editor_v2`, use the existing Playwright/Chromium installation (or documented `PLAYWRIGHT_MODULE_PATH`) and run:

```sh
pnpm exec node scripts/browser/run.mjs http://localhost:3000/ authentication.mjs routing.mjs service-workspace.mjs remote-page-editing.mjs page-writer.mjs source-editing.mjs native-form-schema.mjs external-extensions.mjs persistence-isolation.mjs
```

`remote-page-editing.mjs` is the focused scenario added in phase 1. Existing service-workspace tests exercise local drafts and are not a substitute for remote-page coverage. Keep fixtures at the HTTP boundary; do not add an auth bypass to production or change the API for test convenience.

Check these invariants across phases:

1. **Navigation:** `/auth`, `/services`, `/services/$serviceId`, `/services/$serviceId/$documentId`, legacy `/#/services/...` normalization, deep-link reload, and Back/Forward behavior are identical. Visited editors retain undo history; failed flush/recovery still blocks leaving.
2. **HTTP:** unchanged `/pages`, `/services`, `/taxonomy`, `/version`, and history/auth requests; cookie credentials, methods, payload fields, status handling, and `if-updated-at` timestamp are identical. API `savePage` remains the transport method; `savePageDraft` remains frontend orchestration.
3. **Browser storage:** load literal pre-refactor keys and `{ page, markdown }` baselines; preserve clean, unsaved, working, conflict, migration-backup, and replacement-journal cases. Existing local services/forms/pages must reopen without migration or key rewrites. Cross-tab baseline notifications still work.
4. **History and editing:** restore old content as an unsaved draft without changing current URL/category/parent/visibility; next save uses the current baseline. JSON import/export, failed import recovery, page source-only mode, and undo/redo retain existing behavior.
5. **Deployment and output:** build produces `dist/client/_shell.html`; SPA fallback and origins remain unchanged so browser drafts stay accessible. Review the final diff for accidental route-tree, OpenAPI, fixture, dependency, or backend changes.

Where a configured dev API is available, finish with a disposable page's real save/conflict/history/reload flow. Real GitHub consent and deployed cookie/TLS behavior require a deployment smoke check; report them unverified if unavailable. Do not write to production to validate a naming change.

## Execution record

- Step 1 baseline: all editor gates passed (103 test files, 960 tests). Build emitted existing pure-annotation and large-chunk warnings; no failing baseline checks.
- Added literal storage-key/baseline-shape and interrupted-replacement tests, technical naming guidance, and the remote-page browser scenario. Focused API/workspace/page/converter/native-fixture tests passed (15 files, 270 tests); lint and format checks passed.
- Remote open/edit/save, stale-version conflict, history restore and reload passed before source renames. The installed Playwright expects Chromium 1228 but the machine has Chromium 1248. Browser checks use `/tmp/editor-v2-naming-playwright.cjs` through the existing `PLAYWRIGHT_MODULE_PATH` escape hatch to launch that installed binary explicitly; no packages installed or repository browser configuration changed.
- Step 2: split synchronization, service-page mapping, and Markdown helpers; renamed page input/query symbols and workspace types. Typecheck, lint/format, boundary checks (358), focused tests (11 files, 90 tests), and the remote-page browser scenario passed. No old step-2 symbols remain in live editor code.
- Step 3: purpose-named workspace UI, shared dialog shell and table-hook filename are in place. Typecheck, lint/format, boundaries (359), focused tests (11 files, 90 tests), remote-page editing and authentication passed. A temporary focused local-service/page test also passed creation, switching, storage and reload.
- Existing browser blockers confirmed against `HEAD`: `routing.mjs:104` expects `Search services`, while the existing UI labels it `Search title or URL`; `service-workspace.mjs:244` clicks `Create service` before navigating out of the form, whereas local creation is `Create browser draft` on Services. These scripts remain unchanged; their full scenarios are not claimed passing.
- Step 4: all seven converters flattened; form Markdown names, `createFormDraftCodec`, JSON dialog, consumers, exact boundary/lint paths, converter docs and ADR links updated. Full editor tests passed (104 files, 962 tests), as did typecheck, lint/format, boundaries (359) and capability coverage. No goldens or generated API/route files changed.
- Step 4 browsers: source editing and external extensions passed. `native-form-schema.mjs:233` and `page-writer.mjs:217` hit the same pre-existing `Create service` selector issue (verified in the original scripts and unchanged workspace UI); full suites are not claimed passing.
- Step 5: added the complete source-import migration map and consumer/deferred-probe caveats to `docs/DEVELOPMENT.md`. Retired names now appear only in that intentional migration note within the editor, not live imports. No tracked external editor-source imports were found. All 48 local links in changed documentation resolve.
- Tightened existing negative boundary coverage for browser globals in all seven flat converters plus `page-sync.ts` and `service-pages.ts`; the 25 boundary tests pass without broadening permissions. A temporary declaration comparison against `HEAD` passed for 32 production-source groups after accounting for approved identifier renames/extractions, excluding imports/comments/formatting; transport methods, literals and implementation declarations are preserved.
- Final editor command passed: `VITE_API_ORIGIN=https://api.example.gov.bb pnpm exec nx run-many -p editor_v2 -t build test typecheck lint format:check check:boundaries check:coverage`. Result: 104 test files, 962 tests; 359 boundaries, zero temporary legacy edges; capability coverage passed. Log: `/tmp/editor-v2-naming-final-gates.log`.
- Monorepo command passed: `VITE_API_ORIGIN=https://api.example.gov.bb pnpm exec nx run-many -t build --exclude=landing` (23 projects). Log: `/tmp/editor-v2-naming-monorepo-build.log`. Non-failing build warnings remain; `dist/client/_shell.html` exists.
- Final browser pass: `authentication.mjs`, `remote-page-editing.mjs`, `source-editing.mjs`, `external-extensions.mjs`, `persistence-isolation.mjs`. Each requested suite was run separately so stale-selector failures could not skip later suites. `routing.mjs`, `service-workspace.mjs`, `page-writer.mjs` and `native-form-schema.mjs` still fail at the pre-existing selectors above. Logs: `/tmp/editor-v2-naming-final-<suite>.log`. The temporary focused local-service/page creation, switching, storage and reload check passed again.
- Final scope/diff audit passed: no backend, routes, generated OpenAPI/route tree, frozen data/goldens, manifests, package identifiers, dependency/lockfile, CI/deployment, or TS/Vite/Vitest/Oxfmt configuration changes; `git diff --check` passed. Unrelated `PLAN.md` and `plans/review-pr-3033.md` remain untouched.
- Not verified: real development-API writes, real GitHub consent or deployed cookie/TLS behavior. Browser evidence uses HTTP interception only. No production writes, monorepo-wide tests, commits or pushes were performed; the API naming review and historical probes remain deferred.
