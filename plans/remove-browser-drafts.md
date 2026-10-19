# Remove browser-persisted editor drafts

## Context

Remove browser-persisted drafting from **`apps/editor_v2` only**. The user confirmed:
- Remove browser-only services, pages, forms/calculators, creation/import/attachment flows, and recovery UI.
- Abandon existing local drafts: no migration, export-on-upgrade, or transition UI.
- Keep explicit **Save / Publish changes**, server page visibility states, history, validation, and existing optimistic concurrency.
- Leave mutex locks, webhooks, server autosave, and future saving/publication design to later work. Do not write the team's ADR here.

Citizen-facing forms, the existing form-builder app, clipboard storage, UI preferences, and reusable form/editor/converter capabilities are outside this removal. Existing uncommitted page-comments prototype work and other plans must remain untouched.

### Why saves remain explicit

Our `apps/api_v2/src/services/page-editing.ts` saves over the current page and appends history on every save; `src/schema.ts` has no independent working/published page bodies. Autosaving through that endpoint would publish unfinished public content. **The user explicitly accepted manual Save/Publish for this change. No backend/schema/API-contract changes.**

## Approach

### 1. In-memory editing, not a replacement persistence system
- Simplify the existing `DraftStore` to initialize from explicit source and a codec. Retain subscriptions, visual/Markdown conversion, Apply/Discard, read-only gates, validation, source-only fallback, and Lexical undo integration.
- Remove storage injection/keys, local autosave timers, legacy browser discovery/migration backups, replacement journals, browser-storage retries, and cross-tab storage reconciliation. Remove `DraftProvider`'s storage/pagehide/visibility persistence listeners. Do not substitute sessionStorage, IndexedDB, or a fake-storage adapter retaining the old machinery.
- Preserve exact source on parsing/conversion failure and available in-session downloads. Keep validation-before-Apply and stale asynchronous-import checks in reusable form tooling; remove durable journal semantics, not data-preservation checks.
- Distinguish **unapplied source** from **unsaved-to-server work**: the current `dirty` flag only means the former. Applying Markdown is never a server save.

### 2. API-backed pages and explicit saves
- Initialize each page directly from `pageQuery` + `pageToMarkdown`; hold its editing baseline only in memory. Remove browser seeding, serialized server baselines, baseline storage listeners, and the indefinitely cached `["opened", id]` initialization.
- Reuse `savePageDraft`, including `if-updated-at`, field validation, HTTP 409 handling, and explicit conflict choices. Retain API service/page creation, deletion, previews, metadata, and selective history restoration. Restoring a version remains unsaved until Save/Publish.
- A successful request advances the baseline to **the submitted snapshot**, not whatever the user has typed since. Newer edits remain unsaved. Background query refreshes must not replace a dirty working copy or silently advance its write token. Reopening an evicted clean page uses fresh/current API data.
- Prevent duplicate saves; failed/unauthorized/missing-page outcomes retain current work for retry or download. No automatic publication, saves on blur/navigation, or background uploads.

### 3. Remove the local workspace branch
- Remove workspace storage boot/recovery, local repository/index/key models, local document dialogs/panes, registry-form creation/attachment, browser-form joins, and the “Drafts in this browser” section.
- Services and page navigation come only from the API. Old local URLs resolve through normal API/not-found behavior; old storage cannot shadow an API page.
- Labels read the mounted in-memory page or API metadata, never reopen a stored draft. Keep page `form_id` metadata; there is no server form-editing endpoint to replace the removed local form UI.
- Old draft/workspace/baseline keys become inert: never read, restore, or update them. Leave their bytes alone; do not add cleanup/migration infrastructure or call `localStorage.clear()`.

### 4. Protect work that is no longer durable
- Use one coordinated workspace guard with the existing `useBlocker` and `ConfirmDialog`: ask before leaving a dirty page, before leaving the workspace with any retained unsaved page, and **before** invoking sign-out. Cancel preserves URL, edits, and undo state. Confirmed Leave discards the affected working copy and its cached undo session so revisiting cannot resurrect discarded edits.
- Register browser unload protection while any page has unsaved visual edits, unapplied/invalid source, a serialization failure, or a pending save. A clean workspace does not prompt.
- Keep internal navigation/sign-out blocked while a save is in flight; an already-sent request cannot be cancelled by discarding its UI. An expired-session redirect also goes through the guard; staying leaves work available to download.
- Keep the existing bounded clean-view cache. Never evict dirty/error/pending pages merely because a local flush succeeded; compare clean session identities with API baselines, not storage keys. Perform pane open/close/discard bookkeeping only after navigation is allowed, not while testing a blocked navigation.
- Remove “Saved in this browser” status and recovery promises from source dialogs, save failures, auth, deletion confirmations, and component examples. “Saved/Published” must mean a successful API operation. Explain that unsaved work is available only while this editor session remains open. Reuse existing dialog focus/keyboard behavior and save announcements.

### 5. Keep reusable capability coverage
Removing the app's browser-only form workflow does **not** remove its reusable form editor, presets, codecs, registry, or native import/export. Adapt those hosts/examples/tests to explicit in-memory documents. Move active form browser suites to a test-only fixture using the existing `buildBrowserFixture` pattern; do not add a production session-only form route or keep the old local-workspace path just for tests.

## Files to modify

All paths below are relative to `apps/editor_v2/`. Update/delete associated imports and exports together; no broad naming or styling refactor.

| Area | Critical files / changes |
| --- | --- |
| In-memory state | Simplify `src/persistence/{draft-store.ts,types.ts,index.ts}`; remove browser-journal implementation `src/persistence/replacement.ts`. |
| Hosts | Update `src/host/{source-ui.tsx,page-editor.tsx,paused-notice.tsx,native-form-io.ts,form-json-dialog.tsx,index.ts}` and affected `form-composer.tsx` consumers. Remove `govbb-draft.ts` and `form-drafts.ts`. Preserve `draft-editor.ts`'s connection behavior. |
| Server pages | `src/workspace/{remote-page-pane.tsx,page-sync.ts,remote-page-dialogs.tsx}`; preserve existing client/serialization/query functions and history behavior. |
| Workspace | Simplify `src/workspace/{workspace.tsx,model.ts,documents.ts,document-views.ts,service-pages.ts,service-nav.tsx,document-label.tsx,use-document-draft.tsx,screen-place.ts}`; remove `local-document-dialogs.tsx`, `validation.ts`, and app-only `form-editor.tsx`. Remove remaining local-only helpers/types rather than retaining dead shells. |
| Guard/auth/copy | `src/app.tsx`, `src/routes/auth.tsx`, relevant comment in `src/auth/session.ts`, `src/ui/save-state.tsx`, and `src/routes/prototypes.components.tsx`. Use existing `src/ui/confirm-dialog.tsx` without redesigning it. |
| Unit/integration tests | `src/persistence/*.test.ts`, `src/host/draft-editor.test.ts`, `tests/persistence/`, `tests/host/`, `tests/workspace/`, `tests/helpers/default-form.ts`, affected auth/UI tests, and boundary-test fixtures referencing removed exports. Delete only tests exclusively asserting removed browser behavior; preserve conversion/editability/undo/import coverage. |
| Browser checks/examples | `scripts/browser/{run,form-fixture,authentication,routing,remote-page-editing,page-writer,service-workspace,persistence-isolation}.mjs`, their active form-suite consumers, `tests/browser/{persistence,external-extensions,registry-insertion}.tsx`, and a test-only form host fixture. Reuse `scripts/browser/build-fixture.mjs`. Update `docs/examples/editor-system.tsx` and its tests. |
| Current docs/config | `README.md`, `PRODUCT.md`, `docs/{README,DEVELOPMENT,ARCHITECTURE,MARKDOWN,TERMINOLOGY,FORM-REGISTRY}.md` and other directly affected current host/converter guidance. Remove obsolete deleted-file exceptions from `.oxlintrc.json` if applicable. Do not rewrite historical ADRs/probes or generate a new ADR. |

No changes are planned to `apps/api_v2`, `apps/forms`, `apps/form_builder`, shared package contracts, dependencies, or route structure. Preserve the existing modified `src/routeTree.gen.ts` and untracked page-comments prototype files.

## Reuse

- `savePageDraft` / `ServerPageBaseline` — `src/workspace/page-sync.ts`: explicit versioned saves; retain baseline shape in memory.
- `pageToMarkdown`, `markdownToPageSaveInput`, and selective restoration — `src/api/page-markdown.ts`.
- `pageQuery`, `taxonomyQuery`, `estateVersionQuery` — `src/api/queries.ts`: loading, preload freshness, and existing server invalidation; no replacement synchronization system.
- `DraftStore` editing logic, `draftEditorConnection`, `EditorSessionProvider`, `keptViews` / `DocumentSessions`: source/visual coordination and per-document undo.
- `ConfirmDialog`, existing router blocker, `SaveState`, source `download`, and `PageHistoryDialog`: existing UI and error handling.
- `authenticatedContext` / `servicesFixture` in `scripts/browser/auth-fixture.mjs`, and `buildBrowserFixture` / isolated mounting in `scripts/browser/external-extensions.mjs`: API-boundary app tests and standalone editor fixtures.

## Steps

- [x] Simplify draft state and host bindings to explicit in-memory documents; remove storage/journal adapters and update focused state/source/import tests. **Verify:** conversion, Apply/Discard, editability, undo, and failure preservation still pass without a storage interface.
- [x] Connect API pages directly to in-memory working copies/baselines and explicit Save/Publish. **Verify:** save snapshots, in-flight edits, source-only pages, refreshes, conflicts, and history restoration.
- [x] Remove browser-only workspace services/pages/forms and their models/dialogs/exports. **Verify:** API navigation/create/delete still work, local drafts are ignored, and browser-only routes/features cannot be reopened.
- [x] Add coordinated leave/sign-out/unload protection and safe view eviction; replace obsolete save/auth/deletion copy and examples. **Verify:** cancellation loses nothing, confirmed discard cannot return through undo, and only successful server saves report Saved/Published.
- [x] Adapt active browser suites and reusable form fixtures; update current docs and remove only obsolete persistence tests/config references. **Verify:** no production storage seeding is needed and core page/form authoring coverage remains.
- [x] Run editor checks, browser regressions, and the monorepo build; inspect the final diff for scope and document any environmental blockers. **Verify:** only agreed files change and no new browser persistence or backend behavior is introduced.

## Verification

### Behavioral regressions
1. Seed conflicting/malformed old workspace, draft, working-buffer, baseline, and journal keys. API pages still open from API data; no local-only service/form appears. Spy on storage calls to prove no draft reads/writes, including typing, source Apply, focus/visibility/pagehide, and unmount. Unrelated clipboard/preferences remain untouched.
2. Edit body/title/metadata and valid source-only pages. Typing and Apply send **no PUT**. Explicit Save/Publish sends the current validated snapshot and version header; a reload shows the API's saved content, not unsaved edits.
3. Edit again while a slow save is pending. Its response must not erase later edits or mark them saved. Exercise 401, 404, 409, 422, and network failure; preserve work and accurate retry/download/conflict actions. Background refetch must not overwrite dirty content or bless a stale write token.
4. Test source Apply/Discard, invalid YAML, unsupported-but-valid source-only content, import/serialization errors, and restoring history without an automatic save.
5. Exercise sidebar/service links, Back/Forward, Services, sign-out, session expiry, reload/tab close, and opening more than three pages. Cancel preserves work/location/history and does not revoke auth. Confirmed Leave discards the affected editor/session. Clean pages do not prompt; pending/error/dirty pages are not silently evicted. No duplicate navigation prompts.
6. Verify API service/page creation/deletion, not-found handling, form-ID metadata, source download, undo/redo, and separate editor sessions. Test keyboard focus/Escape on leave confirmation and accessible save announcements.
7. Run reusable form/extension tests using in-memory fixtures; preserve validation, conversion goldens, native import/export, and stale-file-read protection. Update browser assertions to use UI/API responses or fixture state, not local draft keys.

### Commands (implementation phase only)
From the repository root:
```bash
pnpm exec nx run editor_v2:test
pnpm exec nx run editor_v2:typecheck
pnpm exec nx run editor_v2:lint
pnpm exec nx run editor_v2:format:check
pnpm exec nx run editor_v2:check:boundaries
pnpm exec nx run-many -t build --exclude=landing
```

With `pnpm dev:editor_v2` running, execute the updated active browser suite:
```bash
pnpm --dir apps/editor_v2 exec node scripts/browser/run.mjs http://localhost:3000/
```

The existing runner needs an available Playwright/Chromium installation; report if unavailable rather than silently skipping. Landing's live-API prebuild is excluded locally per repository guidance. No builds/tests have been run during planning, because they create artifacts.

## Implementation verification

- `editor_v2:test`: **179 files, 1,169 tests passed**.
- `editor_v2:typecheck`, `editor_v2:lint`, `editor_v2:format:check`, and `editor_v2:check:boundaries`: passed (398 completed boundaries, no temporary legacy edges).
- The complete active browser runner passed **all 17 suites**, using an existing Playwright/Chromium installation through `PLAYWRIGHT_MODULE_PATH`.
- `nx run-many -t build --exclude=landing`: **all 23 projects passed** with `VITE_API_ORIGIN=https://api.example.test`. The first build correctly rejected the local non-production API-origin configuration; the verification override supplies the HTTPS origin required by production builds, without contacting that endpoint.
- Final scope/storage checks passed: production storage access remains only for clipboard data and the sidebar preference; no debug instrumentation or new draft persistence remains. Build-generated formatting changes outside `editor_v2` were reverted. Existing page-comments prototype work was preserved.
- API/auth browser checks use HTTP fixtures; live GitHub consent/cookies and a deployed production API were not exercised. Landing remains excluded because of its live external-API prebuild.

## Known tradeoff

Unsaved edits cannot survive a crash, refresh, confirmed departure, or closing the browser. Leave-page warnings reduce accidental loss but cannot guarantee recovery. Existing local drafts are intentionally abandoned, and form authoring is no longer an app workspace flow until separately integrated with server persistence. Existing optimistic server-save protection stays; no mutex/webhook/collaboration guarantees are added.
