# Wave 1 recovery review notes

These notes distinguish recovered-code observations from verified candidate fixes. Integration status remains in TRACKER.md. Keep recovered checkouts read-only; do not equate an owner report with acceptance.

## Save-state recovery (`frame`, base `61300eb3`)

- `src/ui/save-state.tsx` has no recovered tests. Its announcement hook initializes its previous status to the current one, then returns when they match. Add cases for a failure already present at mount, a changed failure reason, explicit save/retry success, and silent automatic browser saves.
- `SaveState.Failure` deliberately has no live role because the bar announces it. A source dialog makes that background bar inaccessible: verify a failed save inside the open source dialog is still announced once, without duplicate announcements.
- The source hook's server/local precedence must not claim a browser conflict publishes to GOV.BB, or hide unapplied-source/recovery state behind a server “Published” label. Exercise local, API and form hosts, including dirty source and storage failure.
- The recovered `DraftStatus` contract changes, while the patch is unfinished. Find every caller; preserve the now-integrated ConfirmDialog/WorkspaceDialog contracts and shared Bar slots instead of restoring its older source-ui file wholesale.

## Services-memory recovery (`nav`, base `3be1e749`)

- The saved patch is incomplete: it changes `ServicesList` props and adds a route search parser without wiring the workspace's caller or all return links.
- The parser's `String(value)` accepts structured query values, and `Number(value)` accepts values such as arrays. Test malformed URL search types, unknown enum/sort values, invalid page/page size, duplicates, and the default omission round trip. Prefer the existing router's unknown-valued input contract over a new recursive JSON type unless it is actually needed.
- Test every path back to Services, not just browser Back: workspace header, future breadcrumb-compatible navigation, direct links, document navigation and reload. Search/category/status/sort/page must survive where intended; a new search/filter/sort resets pagination.
- Keep API machine status values in filter state, human wording only in presentation. Use the integrated EmptyState/Create service action rather than a parallel empty UI.
- Scroll/mounted-view eviction is a separate item and must preserve history/selection/source recovery outside mounted DOM; do not combine it into this commit.

## Prepared Turn into — independent review

The owner fixed the first three findings with regressions; integrator focused and browser checks pass. Full gates found the fourth issue below, now also reproduced red/green. The item is integrated as `7c520eaa`; all 1,221 tests and affected browser journeys pass.

1. Selecting multiple native form-list items: first conversion replaces the entire run, then the loop tries to replace a detached sibling. Skip already-replaced blocks; cover export and one-step undo/redo.
2. Page-list joining drops the existing wrapper's unknown NodeState/identity. Keep that wrapper or avoid merging metadata-bearing wrappers.
3. A range ending at offset 0 of an empty next paragraph wrongly converts it. Preserve that untouched endpoint in both directions.
4. The shared page menu initially targeted the outer block instead of the nearest list at the caret/hover context. Four migrated existing tests failed before the fix, then passed with exact undo/redo and a fixed-table-cell guard. Prefer the nearest list while retaining whole non-list-block conversion.
5. In a real browser, the nested page menu restored focus to Block options after the outer popup had restored it to the editor. An explicit editor `finalFocus` on the nested menu fixes the competing return. Form menus retain their existing handle-versus-caret entry contract. The browser checks both entry paths on Mac/Windows.

Browser harness corrections do not change product behavior: platform emulation must set userAgent as well as platform; Windows form redo uses Ctrl+Y; Lexical's asynchronously resolved query is distinct from its ranked options. Both slash lists now expose that resolved query for an observable readiness check. No sleeps, layout mocks or weakened content assertions were used.

## Prepared SaveState — independent review

The owner reports red/green fixes and 66 focused tests. Integrator reviewed the connected host/status/recovery code, independently passed 30 focused tests, and ran the real-app browser journey successfully. Integrated as `144b74b4`: full gates passed with 170 files/1,251 tests and both builds. Source-editing, remote-page-editing and persistence-isolation passed along with the new journey; gallery1440/390/320 passed. A later confirmation-page run found one further stale “Recover draft” status expectation; scoped “Not saved” migration passed with exact recovery/download/no-edit assertions intact and was committed separately as `6c19135c`:

1. Source/JSON footer notices are all silenced during a save failure/conflict, hiding independent file-read/copy failures. Suppress duplicate save feedback only.
2. Changing the live-region child key before updating the message can replay the old error on synchronous retry success. Update ID/text atomically and inspect intermediate DOM mutations.
3. A 422 response with an empty validation-error array becomes an empty string and hides failure. Provide a fallback reason and host regression.
4. Explicit retry success when a forced recovery dialog closes is covered, so a suppressed bar announcer does not consume the only outcome during handoff.

Real-browser acceptance caught two harness assumptions, not product defects. Base UI retains ancestors of all `[aria-live]` elements, including the now-empty `aria-live=off` bar announcer; its background buttons are correctly hidden. The journey now checks those controls and real forward/backward Tab containment, retaining exact single-announcer assertions. Chromium resets CDP permission overrides on session detach; a minimal probe demonstrated `prompt → denied → prompt`. Keeping the session attached through the real denied-copy action verifies full-source selection, independent copy/save notices, exact downloaded bytes and retry preservation. Closing returns focus to Markdown without repeating the outcome. Existing source/remote browser selectors also require migration from old retry copy and ambiguous global text to their actual failure boxes.

## Drawing-kit parity

- Captured 118 real-font desktop/mobile surfaces before the extraction (`drawing-kit-v2/before`), including all 54 insertion entries, canvas variants and form/page buttons. Mobile insertion snapshots represent an already-open dialog resized from desktop, not a mobile entry path.
- First candidate comparison found a genuine opening-hours layout change: merging separate JSX whitespace text nodes widened the anonymous flex item by 3.954px. A DOM-node regression failed before the fix and passed after formatting; the subsequent real-browser capture confirms the repair.
- `drawing-kit-v3` preserves the unchanged baseline and the repaired capture. All 118 structure/semantics/computed-style comparisons match. 117 screenshot files are byte-identical; the remaining image differs at three antialiased input-corner pixels by one RGB level. Paired images were visually inspected and decoded pixel evidence is in `pixel-comparison.json`. Saved comparisons remain strict and unchanged.
- Integrated as `0de24a8b`. A fresh same-base before/after capture (`drawing-kit-integrated`) matches **118/118 surfaces in structure/semantics/computed styles and byte-identical screenshots**, with no thresholds or normalization. Parent focused run passes 5 files/21 tests, including installed-renderer narration and insertion previews; registry/external/content browsers pass. Full gates pass173files/1264tests and both builds. The confirmation browser found a stale SaveState status label, not a drawing difference; verified follow-up `6c19135c` remains separate.

## PausedNotice candidate

One DraftStore pause rule now drives host canvas gates and the shared notice. It distinguishes unapplied source, conflicts, replacement/migration recovery and source-only content; ordinary save errors do not lock editing. Quiet notices point to existing Markdown/JSON review surfaces, not upload. Shared-UI colocated tests added after review. Parent baseline browser reproduced the missing form Review action, then candidate passed form review/apply, API-page review/discard, forward/backward Tab containment, focus return, exact source retention and no incidental API save; SaveState and confirmation recovery also pass. Parent focused run:3files/26tests. Additional real inline-source focus check and full gates are pending.

## Markdown shortcut review follow-up

Parent found that removing per-module shortcuts disabled the existing standalone content preset (it has no Turn into capability), and that a Markdown link inside an outer URL could be processed twice and leave an orphan link. Owner reports16 new regressions failed before fixes, then4files/75tests passed. Shared rules now retain marker-only standalone actions and consume an outer URL span before seeking subsequent links. Candidate remains unaccepted; a real keyboard/clipboard journey is being prepared for parent execution.
