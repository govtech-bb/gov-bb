# Resume the editor-v2 redesign backlog

Historical redesign plan. Use the [tracker](editor-v2-handoff/TRACKER.md) and [execution log](editor-v2-handoff/EXECUTION.md) for later integration status before resuming work.

## Context

- The permanent checkout is on `editor-v2-redesign` at `18d5eefeefad326ef472ebd32e0230408b4400c9`, matching the handoff: 31 of 88 board items done, 20 landed in the last session.
- The handoff reports typecheck, lint, formatting, boundaries, 1,116 unit tests and the Vite build passing there. The 15 browser suites were last green at `2c483caa`; their current status is unknown.
- Four item commits await review/integration: ConfirmDialog (`8be5bad9`), titles/headings (`61300eb3`), sidebar collapse (`3be1e749`), canvas text equivalents (`bc40e9c4`).
- Partial work remains in temporary worktrees: save state (frame), services memory (nav), Turn into (write), preview sheet (forms). Tracked diffs and all 14 untracked implementation/test files are now archived as Markdown under `plans/editor-v2-handoff/recovery/`, with original HEADs/status. Do not treat this work as reviewed or complete.
- The handoff, implementation brief, package guidance and all 88 item specifications are archived under [editor-v2-handoff/](editor-v2-handoff/).
- The raw item JSON snapshot is stale (12 done, 74 todo, 2 parked). Use the user's 31-done handoff plus commit/code evidence, not those statuses. Remaining scope reconciles to 57: 4 pending commits + 12 wave-1 items + 38 items in seven wave-2 packages + glossary + 2 parked.
- The user's checkout is dirty. Preserve `apps/editor_v2/src/routeTree.gen.ts`, the untracked page-comments route and `page-comments-preview.*`, `PLAN.md`, and all pre-existing `plans/*`. Never include the user's page-comments generated route lines in our commits.

## Approach

Proceed with the full unparked backlog. The user delegated scope/workspace choices. The restart-safe item ledger is [TRACKER.md](editor-v2-handoff/TRACKER.md); detailed acceptance criteria and original file references are in [BOARD.md](editor-v2-handoff/BOARD.md) and [the package guidance](editor-v2-handoff/guidance/).

1. Preservation is already complete in Markdown: handoff, brief, guidance, five original packages, 88 item specifications, and four WIP recovery snapshots. Verify these against live worktrees before recovery; never apply unreviewed patches wholesale.
2. After approval, create a fresh local canonical `.bare` agent root beneath the permanent ignored `tmp/editor-v2-agents/` directory, copied through Git from this local repository. Keep all worker/integration checkouts under it. Do not convert the user's live `.git` layout, move/delete old worktrees, or push to any remote. Reuse the installed toolchain; if dependencies need restoring, use the existing lockfile unchanged and pnpm only.
3. Start its integration checkout at `18d5eefe` and run the stale browser baseline before adding anything. Then review/integrate the four pending item commits individually and repeat the full gates. This separates existing regressions from merge regressions.
4. Finish the 12 wave-1 leftovers in bounded agent packages with exclusive file ownership; review partial work before reusing it.
5. Continue with all seven wave-2 packages; glossary comes last. Keep `api-asks` and `forms-to-api` parked, with no speculative API work.
6. Integrate one green item at a time. Bring reviewed commits back through local Git to `editor-v2-redesign` at checkpoints only when the user's working changes can be preserved intact; otherwise keep the verified integration head and report the overlap, never reset/stash their work. No push or PR without separate approval; any future PR targets `main`.

### Agent ownership and ordering

Use five wave-1 and seven wave-2 package owners as queued assignments, plus an integrator/reviewer. Limit active implementation agents to three and run heavy checks/browser servers through one verification queue (10 cores/16 GB). Reuse agents between packages. Branch names use hyphens, no dots, and stay within the 63-character preview limit.

- Land `empty-loading` early; frame/nav consume it instead of creating temporary look-alikes.
- Within writing: `turn-into` → `markdown-shortcuts` → `link-picker`; within forms: `preview-sheet` → `drawing-kit`.
- After wave 1, produce `ActionList`, shortcut ownership/announcement contracts and `ErrorSummary` first. Settings and form controls consume them rather than rebuilding them.
- `settings-panel` removes question settings before `block-menu` finishes the shared action-only menu. `ActionList` lands before formula popups and the palette.
- Publish's draft registry lands before final unsaved title/list/breadcrumb integration. Frame's save/pause/notice work lands before publish/messages/history touch those areas.
- Serialize edits to `workspace.tsx`, `remote-page-pane.tsx`, `host/source-ui.tsx`, form block menus and `prototypes.components.tsx`. Shared primitive producers own their files and demos; consumers wait for the producer commit. No two agents independently replace the same pattern.
- One item per commit, explicit staging only, new shared UI with colocated tests and gallery demos, no dependencies or unrelated refactors. The integrator owns the ledger and conflict resolution.

## Files to modify

Planning only: this file and new Markdown snapshots beneath `plans/editor-v2-handoff/`.

All implementation paths below are relative to `apps/editor_v2/`; each package also updates its matching tests. Detailed per-item requirements are linked from the ledger.

| Package | Critical files and intended change |
| --- | --- |
| Pending commits | `src/ui/{confirm-dialog,button,dialog,drawer,sidebar,side-panel}.tsx`; `src/workspace/{document-label,screen-title,workspace,service-nav}.tsx` and new `screen-place.ts`; source/workspace dialogs; `src/editor/react/block-dom.ts`, `src/forms/editor/{answer-dom,drawn-input}.ts`, answer nodes/projection, `index.css`; related unit/browser tests. |
| Kit | `src/ui/{empty-state,loading-state}.tsx` (new), `surface.ts`, existing `loader.tsx`; migrate empty/loading/no-result states in `router.tsx`, `routes/__root.tsx`, workspace, services table and popups. |
| Frame | `src/ui/{save-state,paused-notice}.tsx` (new), `document-bar.tsx`, `banner.tsx`; `src/host/{source-ui,page-editor,form-composer,form-json-dialog}.tsx`; `src/workspace/{form-editor,remote-page-pane,workspace}.tsx`, `src/persistence/draft-store.ts`, `src/app.tsx`. Shared save/pause state and notice placement. |
| Nav | `src/router.tsx`, `src/routes/_workspace.services*.tsx`, `src/workspace/{services-list,workspace}.tsx`, new validated `services-search.ts`, `src/ui/table/table-components.tsx`; minimal editor session/history support for safe pane eviction. URL filters, path scroll/view memory and query preloading. |
| Write | `src/editor/core/{actions,definition,module}.ts`, new conversion capability; `src/editor/modules/{formatting,headings,lists,links}/`, page text/insertion/block/slash menus, form block menu and logic Link URL; new shared Turn into/LinkPicker UI with host-injected page search. |
| Forms | `src/editor/react/insert-modal.tsx`, `src/forms/editor/{field-module,content-module}.tsx`, `src/forms/editor/{answer-dom,drawn-input}.ts`, insertion previews, `src/forms/features/shared/presentation.tsx`, `src/presets/form-registry/preview.tsx`, `src/pages/page.css`; one PreviewSheet/PreviewQuestion and shared canvas/preview drawings. |
| Publish | `src/workspace/{remote-page-pane,page-sync,service-pages,services-list,remote-page-dialogs,workspace}.*`, `src/pages/metadata-fields.tsx`, `src/api/{client,page-markdown}.ts`; shared publish/visibility/path/conflict UI and browser draft registry. |
| Messages | `src/ui/field.tsx`, shared ErrorSummary/failure UI, `src/api/client.ts`, `src/auth/session.ts`, `src/app.tsx`, source/import/create dialogs and remote page errors; plain messages, focusable errors and one session-ended state. |
| Settings | `src/workspace/form-editor.tsx`, `src/forms/react/{block-menu,settings-controls,block-settings}.*`, `src/forms/editor/{native-field-controls,native-form-settings,form-metadata}.*`, `src/forms/features/logic/native-controls.tsx`, existing reference/validation code; selection-driven settings, ComputedField, safer deletion and live checks. |
| Blocks | `src/ui/action-list.tsx` and shared block menu (new), `src/editor/{core,react}/`, `src/editor/modules/formatting/toolbar.tsx`, `src/pages/{action-menu,slash-menu,block-controls}.tsx`, form menus/rails/mentions/formulas; one insert/action/shortcut model. |
| History | `src/workspace/page-history-dialog.tsx` → panel/VersionView, `src/pages/metadata-fields.tsx`, `src/host/{source-ui,form-json-dialog}.tsx`, local dialogs, services list/workspace, document bar; source helpers, details, distraction-free mode and PageHeader. |
| Form controls | `src/ui/pill.tsx` and shared CheckList/SearchField/RepeaterList/AuthorNote/InputGroup/FoldToggle; field and logic/formula consumers; new isolated form-preview UI/runtime using `tests/helpers/native-fixture-interpreter.ts` as a limited semantic reference. |
| Find | `src/workspace/{workspace,service-nav,services-list}.*`, the title/location hook from the pending frame commit, shared Breadcrumbs/CommandPalette/item actions, focus/shortcut routing. |
| Glossary | `docs/TERMINOLOGY.md`, author-facing strings, focused terminology test; update `PRODUCT.md`/`docs/ARCHITECTURE.md` only where implemented settings/preview behaviour changes the documented scope. |

All shared additions: `src/routes/prototypes.components.tsx` plus `src/ui/*.test.tsx`. Behaviour regressions: `tests/{editor,pages,forms,workspace,persistence}`, existing host/API/auth tests, and `scripts/browser/*.mjs`. If routes change, regenerate `src/routeTree.gen.ts` only in a clean isolated checkout; never hand-edit it or include the user's page-comments entries.

Existing user changes listed above are outside scope.

## Reuse

- Shared UI: `Bar`, `DocumentBar`, `SidePanel`, `Sidebar`, `Field`/`FieldGroup`, `Menu`, `Popover`, `Button`, `TextLink`, `Tag`, `toast()`, `Loader`, plus `surface.ts`'s `touchTarget`, `PopupName`, `listEmpty`, `listFooter`. Extend these rather than copying their layouts.
- Editor actions/history: `rankActions`, `$availableActions`, `$executeAction`/`executeAction` in `src/editor/core/actions.ts`; `useSlashTrigger`; `registerEditorHistory` and `HISTORY_PUSH_TAG` for single-step operations; `shortcut()` for platform-specific labels. `EditorAction.markdown` already exists—do not add a duplicate metadata field.
- Links: `normalizeLinkUrl`, `isSafeLinkUrl`, `isSupportedLinkUrl` in `src/editor/modules/links/url.ts`; workspace search is injected, never imported into reusable page/editor modules.
- Persistence/navigation: `DraftStore`'s existing `editable`, `retry`, `flush` and conflict/recovery state; `openDocument`/`flushDocument`; TanStack `servicesQuery`, `serviceQuery`, `pageQuery`, `pageHistoryQuery`, `pageVersionQuery`; `workspaceAdmission` remains the auth guard. A loader must use the same QueryClient as the mounted workspace and avoid remote fetches for browser-local documents.
- Forms/publishing: `lexicalToFormSchema`/`validateFormDefinition`, built-in reference walkers **and installed modules' reference handlers**, field module-owned renderers, `page-sync.ts` optimistic baselines and `pageVersionToDraftMarkdown` selective restoration; existing `api/page-markdown.ts` `urlProblem` for path validation and `api.landingUrl` for public links. Fold the existing `SsbField` Default/Custom/Reset behaviour into ComputedField. Keep persisted IDs, draft keys, unknown metadata and source bytes compatible.
- Shared gallery: `apps/editor_v2/src/routes/prototypes.components.tsx`.
- Existing test helpers: `apps/editor_v2/tests/helpers/page-editor.tsx`, headless Lexical tests under `tests/editor`, form tests under `tests/forms`.
- Existing `scripts/check-boundaries.ts`, oxlint/oxfmt, Vitest and Vite verification commands in `apps/editor_v2/package.json`.
- `apps/editor_v2/scripts/browser/run.mjs` accepts explicit suite filenames. Its default 17-suite list is NOT the handoff's 15-suite local baseline; use the recovered explicit list.
- Browser fixtures already exist: `scripts/browser/auth-fixture.mjs` and `form-fixture.mjs` (`openDemoForm`, `seedFormDraft`, `formDraftUrl`). Preserve boundary seeding rather than restoring the removed demo landing flow.

## Steps

- [x] **Recovery/setup:** verify the Markdown archives against the original worktrees, record base SHAs, create permanent isolated agent/integration checkouts, and recover WIP only into its owner's checkout. Verify the user's original changes are untouched.
- [x] **Baseline:** run static/unit/app-build gates and the exact 15 browser suites at `18d5eefe`; investigate failures before taking additional feature work. Record the baseline and browser environment.
- [x] **Pending commits:** review/cherry-pick `8be5bad9` → `bc40e9c4` → `3be1e749` → `61300eb3` (independent canvas change early; drawer extraction before final heading reconciliation). Retain both gallery demos, required popup names, Bar/sticky layout and live draft titles. Fix review findings with regression tests; repeat full browser/static/unit/build gates before marking the four items integrated.
- [ ] **Wave 1:** finish the 12 ledger items across kit/frame/nav/write/forms, reviewing the four recovered patches before reuse. Integrate one verified item at a time; run the full 15 suites and cross-package journeys at the wave checkpoint.
- [ ] **Wave 2 foundations:** deliver the shared ActionList/shortcut/announcement and ErrorSummary contracts, then the publish, messages and settings items with explicit ownership of overlapping files. Use the preserved seven-package guidance and complete every listed caller.
- [ ] **Wave 2 consumers:** finish blocks (including the action-only block menu after settings), form controls/preview, history and find. Check producer/consumer integration before marking each of the 38 wave-2 items done; record API-dependent omissions as partial, not completed features.
- [ ] **Glossary/docs:** add the workspace/save/publish glossary, align final author-facing strings, add a UI-copy guard against “content API”, and update only documentation affected by shipped behaviour. Leave the two API items parked.
- [ ] **Final verification/handoff:** run full app and monorepo gates, all 15 suites plus new targeted flows, accessibility/visual checks and preservation regressions. Reconcile all 88 items with SHAs/results/remaining blockers; transfer only verified commits to `editor-v2-redesign` without overwriting user work, and leave a permanent handoff. No push or PR.

## Verification

During planning: read-only inspection only; do not run builds, formatting or test commands that generate files.

After approval, before each item commit, from `apps/editor_v2`:

```sh
pnpm exec tsc --noEmit
pnpm run lint
pnpm run format:check
pnpm run check:boundaries
pnpm run check:coverage
pnpm exec vitest run --maxWorkers=4
VITE_API_ORIGIN=https://api.example.invalid pnpm run build
```

- Add a regression test for each behaviour change and demonstrate it fails without the fix.
- Recovered the exact 15-suite local baseline from the old package/run scripts: authentication, native-logic-controls, native-formula, native-field-controls, bug-undo-after-inserts, source-editing, unified-logic, registry-insertion, external-extensions, persistence-isolation, confirmation-page, remote-page-editing, content-modules, contributions, composition. Pass each with `.mjs` to `scripts/browser/run.mjs`; re-run at the pending-commit checkpoint and after each wave. Live-API suites are a separate check, not a substitute.
- Browser commands and dependency resolution are documented in [BROWSER.md](editor-v2-handoff/BROWSER.md). Historical test results are recorded separately in the execution log and tracker.
- Before committing, also run the repository-required build from the checkout root: `VITE_API_ORIGIN=https://api.example.invalid pnpm exec nx run-many -t build --exclude=landing`. Run relevant Nx tests; at the final gate run `pnpm exec nx run-many -t test`. Serialize expensive runs and use Nx caching. Landing's live-API prebuild and real OAuth/deployment-cookie smoke tests remain explicitly unverified if the required services are unavailable.
- New browser journeys: Services filters → document → every route back; bad URL search values; more than the mounted-pane cap with scroll/selection/undo/source recovery intact; offline/401/409 save paths; unsaved title/sidebar/list alignment; whole-page and referenced-question deletion/Undo; keyboard-only insert/convert/link/palette; settings and preview across form types; history compare/restore retaining path/category/visibility.
- Visual/a11y: 1440px and 390px screenshots, 320px reflow and 200% zoom, keyboard/focus return, coarse-pointer targets, reduced motion, popup names and non-duplicated live announcements. Test the settings panel at 1199px/1200px and sidebar at its separate `lg` breakpoint. Compare DOM/computed styles before/after drawing-kit extraction, not screenshots alone. Record unavailable real-screen-reader/device checks rather than claiming them.
- Preserve old Markdown/native JSON/draft keys, unknown metadata, authored custom validation messages and recovery journals. No feature silently discards unsupported content.
- Inspect final staged paths and source diff; compare the original dirty checkout's protected files before/after. Never overwrite/stage the user's unrelated work, planning archives or transient verification output.

## Integration risks already found

Read-only review was performed by the integrator and a separate Codex reviewer; no runtime results are assumed.

- `8be5bad9`: Button's `pending` blocks button activation but its `href` branch still navigates. Restrict `pending` to action buttons in the prop types (links remain navigation), with a contract regression test. Preserve pending-dialog close protection. The commit replaces `Dialog.Footer` with `Dialog.Actions` and changes WorkspaceDialog's body/footer contract; later source/history work must use the new API, not restore the old one.
- `bc40e9c4`: OptionNode adds narration relative to `[data-card]`, then dereferences `[data-answer]` on reindex; custom ChoicePresentation requires neither marker. Own narration outside custom presentation markup and test a custom choice without those markers. Custom inputs with nested `[data-text]` must receive narration too. Keep `$caretLine`/`registerLineHint` during the merge.
- `61300eb3` changes `document-label.tsx` where the integrated nav work now avoids stale server titles (`draftFollowsServer`). Keep that guard when extracting `useDocumentLabel`, and pass the mounted remote DraftStore through `useScreenPlace`; its pending version currently reads live drafts only for local documents. Test remote retitle and external server refresh together.
- `3be1e749` extracts a shared Drawer while the frame commit changes SidePanel heading context. Preserve both contracts, the sticky Bar offsets and the separate sidebar/settings breakpoints; test keyboard focus return and storage-denied collapse persistence.
- The pending gallery changes are additive, not competing replacements. New `Menu.Content`/`Popover.Content` calls must satisfy the integrated accessible-name requirement. Add browser tests for drawer focus return and opening a workspace dialog from the navigation drawer; existing unit tests do not prove that handoff.
- Draft registry discovery must include remote API drafts not present in the local WorkspaceIndex, mounted stores and unapplied source. `ServiceNavRow` has no unsaved property yet; extend that single model rather than inventing another sidebar model.
- `toast()` currently offers a callback button, not an external link. Extend the shared action contract for a real View on site link, only when `api.landingUrl` is configured. Never invent saver identities/timestamps: page records lack actors and browser conflicts only contain source/working values.
- WIP save-state and Services memory have no new tests yet. Turn into and PreviewSheet have uncommitted tests, but no passing result is assumed. In particular, reject broad import-boundary relaxations in the preview patch and test conversion undo/content preservation before reuse.

## API boundaries

No `api_v2` implementation/schema work in this plan. Keep `api-asks` and `forms-to-api` parked. Defer shareable preview links, automatic redirects/tree moves, full editor-wide page search, form server history, owner/SEO-title/noindex fields and unsupported publishing features. Report each limitation on its owning item.

Existing API site preview uses the server's `x-preview-token` secret, not a browser-safe share-link service; never place that secret in editor code or URLs. Public-site search is not an authenticated all-pages index. The API accepts URL/parent changes but does not provide the guided move/redirect workflow, which stays deferred per handoff. Build PathField on existing `src/api/page-markdown.ts` `urlProblem`, checked against `apps/api_v2/src/modules/page.ts`'s `PageUrl` rules; do not duplicate its validator or import backend runtime code into UI.

## Planning decisions

- Include all remaining unparked work, with explicit integration/browser checkpoints rather than one large merge.
- Use permanent isolated worktrees after approval; leave the dirty main checkout and original temporary work intact until recovery and integration are verified.
- Keep the current and two most recent inactive document views mounted (a fixed implementation bound, not a new setting). Preserve per-document undo/selection/scroll and unapplied-source recovery outside mounted DOM. `registerEditorHistory` currently keeps history in a mount-bound closure; simple unmounting would lose it. Unsafe-to-flush/recover drafts remain pinned until safe; navigation blockers still take priority.
- Resolve the guidance's Ctrl/Cmd+K overlap in favour of the final `find` package contract: selected editor text opens the link picker; otherwise it opens the palette. Link insertion without selected text remains available through the formatting controls, and caret-link inspection remains available. One shortcut owner prevents both opening.
- The proposed form-preview interpreter is explicitly a test-only proof for seven non-repeating fixtures, not a production respondent runtime. Do not just move it wholesale: extract supported pure semantics behind tests, retain independent fixture expectations, and show a truthful unsupported-preview state instead of silently evaluating missing capabilities. No submissions, uploads or live integrations.
- `src/router.tsx` already enables scroll restoration but disables preloading. Extend its existing TanStack Query/Router integration rather than adding another cache or router.
- Save/conflict actions must name their actual destination: a browser-local conflict must never claim it publishes to GOV.BB. Source-only documents, pending source, failed storage and optimistic API conflicts keep their existing recovery guarantees.
- No new dependencies. Preserve GovBB density/tokens, the user's trident Loader, `ui/select`'s prototype-compatible `panel` export, and the 1200px settings breakpoint. Vite has no explicit browser target override; use conservative-modern CSS with fallbacks where needed, not a new styling/animation stack.
