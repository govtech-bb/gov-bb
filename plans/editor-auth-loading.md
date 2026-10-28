# Editor auth and contextual loading

**PR scope:** implementation originally ran in a shared checkout containing other in-progress work. The submitted `editor-v2-auth-loading` branch isolates auth/loading changes against `v2-rewrite`; it does not include collections, visibility, version-history removal, or site-preview changes. The PR verification below describes the submitted branch; earlier execution evidence describes the shared checkout.

## Context

The reported first visit passes through auth checking, an apparent TanStack error/loading screen, another loader, and then GitHub. Normal navigation also feels too eager to replace the whole app with loading UI. The goal is a clear sign-in journey and loading feedback scoped to the content actually waiting.

Scope: `apps/editor_v2` and its existing GitHub/Better Auth integration. The user confirmed an explicit **Continue with GitHub** screen and visible **Loading <context>** text. Reported environment: https://editor-v2.sandbox.alpha.gov.bb/.

### Findings

- `src/routes/__root.tsx` supplies a full-page “Loading editor…” ClientOnly fallback; `src/router.tsx` supplies another as the default route pending component. Neither defines an app-owned error component here.
- `src/routes/_workspace.tsx` checks admission before mounting `App`, then redirects to `/auth` when signed out or unavailable. Navigation within an admitted workspace already reuses the unexpired admission via `workspaceAdmission`.
- `src/routes/auth.tsx` starts OAuth automatically in `beforeLoad`; the explanatory auth page renders only after that work completes. The callback checks the session, then returns to the workspace.
- `src/ui/loading-state.tsx` delegates the label to `Loader`, which renders it in an `sr-only` span. Add visible context without duplicating screen-reader announcements or changing the trident animation.
- Existing service, page, sidebar, and table loading states offer narrower boundaries to reuse rather than introducing a global loading manager. `EditorWorkspace` deliberately stays mounted across all workspace routes to preserve in-memory page sessions and the collections preview.
- `createEditorAuth` already has a 15-second timeout, no automatic retries, explicit callback URLs, a GitHub authorization-URL allowlist, and authoritative session checks. Keep this adapter and the API-owned admission policy; do not replace Better Auth.
- `scripts/browser/authentication.mjs` already exercises actual routes with mocked auth/API HTTP responses, including missing callback cookies, provider denial, service outages, sign-out, and cancelled expiry with dirty work. It currently asserts automatic OAuth, so revise it for explicit consent and add delayed-transition assertions rather than building a new harness.
- `README.md` and `apps/api_v2/README.md` currently promise automatic sign-in; update those statements and the editor development notes.
- Route content preloads (`src/workspace/preload.ts`) are already non-blocking. The services table already has local skeleton rows; `ServiceNav` already says “Loading pages…”. Preserve those patterns and avoid adding spinners to synchronous collections-preview screens, filters, cached navigation, or background polling.
- `ServicesList` replaces cached results on any query error; `EditorWorkspace` can show a full content error alongside cached service data. Distinguish first-load failure from failed background refresh: keep usable data and show a local retry notice for transient failures.
- `localReturnPath` currently accepts only service URLs, although the current workspace also has categories, content-type, and collection-entry routes. Extend the explicit local allowlist to these existing protected routes, retaining rejection of auth loops, external URLs, and malformed paths.
- There are substantial pre-existing, uncommitted changes, including editor routing/workspace files. Preserve them; this planning work changes only this markdown file.

The reported TanStack flash has not been reproduced. Static fetching cannot observe hydration, so do not attribute it to a specific router bug yet. Reproduce it in the real route/browser flow, including a production-built SPA shell, before claiming it fixed. If it cannot be reproduced, request a short recording and report that limitation rather than hiding it behind a loader.

## Approach

### 1. Explicit, understandable sign-in

- Keep `/auth` public and separate from the workspace. A normal visit to `/auth` renders **Sign in to GovBB editor**, the existing verified-email/active-`govtech-bb` membership requirement, and **Continue with GitHub**. Unknown/error states remain safe recovery states.
- Remove OAuth initiation from route `beforeLoad`. Only the button starts `auth.signIn`; reuse `Button.pending` for **Opening GitHub…**, prevent duplicate requests, and retain the same screen on failure. Visiting, hovering, preloading, retrying session checks, and signing out must not automatically open GitHub.
- A valid session opens the requested workspace without flashing the sign-in screen. Keep callback cookie verification, and show **Completing sign-in…** while it runs. Denied/cancelled sign-in and a missing callback cookie stop with clear recovery, never a redirect loop.
- Distinguish unavailable session checks from being signed out. **Try again** after a check failure rechecks the session; it does not assume GitHub sign-in is needed. Provider/cookie recovery offers an explicit sign-in action.
- Keep `localReturnPath` as the one redirect validator; extend its allowlist to the existing categories, content-type, and collection routes, including query/fragment preservation. Do not admit arbitrary same-origin paths or `/auth` loops.

### 2. Loading belongs to the work being done

| Situation | Feedback and boundary |
| --- | --- |
| Static shell / initial session check | One consistent entry layout; **Loading editor…** during bootstrap, **Checking your session…** during the actual auth check. No private workspace before admission. |
| Signed out, waiting for user | Sign-in screen; no perpetual loader. |
| Starting OAuth | **Opening GitHub…** on the sign-in action, not another full-page replacement. |
| OAuth callback | **Completing sign-in…** on the entry surface, then the requested destination. |
| Services first load | Existing table skeletons plus visible **Loading services…** in the results region; preserve heading, filters, navigation, and header. |
| Service/page first load | Existing content-pane loader with **Loading service…** or **Loading page…**; sidebar can say **Loading pages…**. When opening a page, keep its page-level wording while required service/page/taxonomy data arrives. |
| Cached navigation, background refetch, session focus check, version polling | Keep current content; no blocking spinner. Transient refresh failure gets a local retry notice without removing usable data. |
| Save/create/delete/sign-out | Existing button/dialog/save-state feedback only. |
| Local filters and in-memory collections preview | Immediate updates; no invented loading state. |

- Make `LoadingState.label` visible beside/below the existing trident. Keep the animation and current GovBB tokens; do not redesign the design system.
- Replace the blanket full-page router pending policy with explicit initial-auth/callback boundaries. Preserve non-blocking `primeService`/`primePage`, intent preloading, and the mounted `EditorWorkspace`. Use native router pending options, not a new timer framework or artificial minimum loading duration.
- Keep page+taxonomy dependencies that are genuinely needed to construct the initial editable document. Do not initialize incomplete metadata or overwrite an open draft when a background request finishes.
- Separate transient background failures from first-load failures and authoritative 401/403/404 responses. Authentication/access failures must remain explicit, and deleted content must not be presented as a successful stale refresh.

### 3. Errors and accessibility

- Add app-owned router recovery for genuine unexpected errors using `EmptyState`/`Button`, with a meaningful retry and no raw provider messages or framework debug panel. Fix any reproduced transition error; do not convert errors into loading or blank screens. No automatic page reload that discards work.
- Preserve the current session focus/expiry checks and the single unsaved-work guard. Failed sign-out, cancelled expiry navigation, and pending saves must retain edits and undo state.
- Visible statuses have one polite announcement, not duplicate loader/text announcements. Use scoped `aria-busy`, useful page titles, keyboard-operable actions, and predictable focus on auth navigation/recovery; background refresh must not steal focus. Keep reduced-motion support and check narrow screens/200% text zoom.

**Out of scope:** replacing Better Auth, adding providers/passkeys, changing GitHub membership/cookie/CORS policy, new session persistence, a global loading context, dependency upgrades without a demonstrated need, or rebuilding already-local loading flows.

## Files to modify

Paths below are relative to `apps/editor_v2/` unless stated otherwise. Preserve current uncommitted work; leave correctly scoped consumers unchanged.

- `src/router.tsx`, `src/routes/__root.tsx`, `src/routes/_workspace.tsx` — initial pending ownership and app-owned router recovery.
- `src/routes/auth.tsx` — explicit sign-in action, callback progress, and retry states.
- `src/auth/session.ts`, `src/auth/session.test.ts` — public auth search defaults and safe return paths for all current workspace routes.
- `src/ui/loading-state.tsx`, `src/ui/loading-state.test.tsx` — visible labels and single accessible status.
- `src/workspace/services-list.tsx`, `src/workspace/workspace.tsx` — list-level context and first-load versus background-error presentation; page-specific wording without replacing the shell.
- `src/workspace/remote-page-pane.tsx` only if reproduction exposes a remaining loading-boundary defect; preserve fresh-preload and draft-baseline behavior.
- New `tests/workspace/auth-routes.test.tsx`; extend `tests/workspace/workspace.test.tsx`, `services-list.test.tsx`, `remote-page-pane.test.tsx` for transitions and cached-content preservation.
- `scripts/browser/authentication.mjs`, `scripts/browser/service-workspace.mjs` — real-route delayed auth/loading regressions with existing HTTP fixtures.
- `README.md`, `docs/DEVELOPMENT.md`, and repository-root `apps/api_v2/README.md` — remove automatic-sign-in claims and document the verified behavior. No API implementation/schema change is planned.

## Reuse

- `workspaceAdmission`, `localReturnPath`, `parseAuthSearch`, `authCallback` — `apps/editor_v2/src/auth/session.ts`
- Existing `EditorAuth` adapter — `apps/editor_v2/src/auth/better-auth-client.ts`
- `LoadingState` / `Loader`, `Button.pending`, `Banner`, `EmptyState`, and the existing `Announcer` where stable announcements are needed — `apps/editor_v2/src/ui/`
- Existing table skeletons — `apps/editor_v2/src/ui/table/table-components.tsx`
- Query options/cache and non-blocking intent preloads — `apps/editor_v2/src/api/queries.ts`, `src/workspace/preload.ts`, `src/router.tsx`
- Session rechecks and sign-out handling — `apps/editor_v2/src/app.tsx`
- Existing HTTP fixtures and auth browser suite — `apps/editor_v2/scripts/browser/authentication.mjs`, `auth-fixture.mjs`, `page-api-fixture.mjs`
- Existing document-session preservation and leave guard — `apps/editor_v2/src/workspace/workspace.tsx`, `workspace-leave-guard.tsx`

## Steps

- [x] **Capture regressions:** extend the existing route/browser harness with held session/OAuth/data responses, event/error capture, and a production-shell reproduction. Verify the new explicit-sign-in assertions fail on the current automatic flow; document the TanStack flash separately if not reproducible.
- [x] **Fix the auth journey:** implement the explicit button, distinct session/provider/callback recovery, contextual entry pending views, safe return paths, and app-owned unexpected-error handling. Verify zero OAuth starts before consent, one per activation, no auth loops, and preserved deep links.
- [x] **Scope loading and refresh feedback:** expose contextual labels, keep the shell and cached content, add services-result context, and show transient refresh errors locally. Verify delayed data changes only its own region, fast/cached/local operations add no blockers, and drafts/undo survive.
- [x] **Verify and document:** run focused and browser suites plus repository build checks; check keyboard/announcements/reduced motion and update auth documentation. Record any unavailable browser infrastructure or unverified sandbox-only behavior explicitly.

## Verification

### Acceptance checks

- Fresh signed-out `/` and protected deep links settle on the sign-in screen without OAuth requests, error flashes, or protected content. A valid session skips that screen. Direct `/auth` is usable.
- Hold each request to inspect intermediate UI, then resolve/reject it: session check, OAuth start, callback, services, service detail, page, and taxonomy. Assert DOM transitions and absence of uncaught router/hydration errors—not just the final URL.
- Double activation sends one OAuth request. Hover/preload does not start sign-in. Cancellation, denial, missing callback cookies, timeouts, and outages recover without loops or false signed-out claims.
- Callback preserves service and collections-preview destinations, search, and fragments. Existing hostile/external/auth-loop return-path tests still pass.
- During internal navigation/background refetch, assert the header and workspace stay mounted, cached results remain on transient failure, and dirty content/undo/save tokens survive. Test 401/403/404 distinctly from network/5xx failures.
- Preserve existing sign-out/expiry/unsaved-work tests, including cancelled sign-out, failed revocation, preview drafts, and departure blocked during saves.
- Keyboard-only sign-in/retry, visible focus, single status announcements, reduced motion, 320px layout and 200% text zoom.
- Repeat the cold-start and callback scenarios against production-built `dist/client` served with the documented `/_shell.html` rewrite. An owner-assisted sandbox GitHub/cookie smoke remains necessary; mocked OAuth cannot prove provider consent or deployment cookie behavior.

### Commands after approval

```sh
pnpm exec nx run editor_v2:test
pnpm exec nx run-many -p editor_v2 -t typecheck lint format:check check:boundaries
VITE_API_ORIGIN=https://api.example.gov.bb pnpm exec nx run-many -t build --exclude=landing
```

With the editor running locally with auth bypass **off**, use the existing installed Playwright/Chromium (no automatic install):

```sh
PLAYWRIGHT_MODULE_PATH=/absolute/path/to/existing/playwright-core \
  pnpm --dir apps/editor_v2 exec node scripts/browser/run.mjs http://localhost:3000/ \
  authentication.mjs service-workspace.mjs remote-page-editing.mjs routing.mjs content-collections.mjs
```

Use mocked auth/API responses for automated scenarios. If browser infrastructure is unavailable, report the blocker; passing unit tests alone does not verify the reported visual flash.

## Confirmed decisions and evidence limits

- Explicit **Continue with GitHub**, not automatic OAuth on entry.
- Visible contextual labels alongside the existing loader.
- Sandbox URL confirmed. Its static HTML fetch returns “Loading editor…”; this does not execute hydration or reproduce the reported TanStack flash.
- Planning completed without source changes. Implementation approved; execution evidence follows.

## Execution evidence

### Step 1 — captured regressions

- `pnpm --dir apps/editor_v2 exec vitest run tests/workspace/auth-routes.test.tsx`: **5 failed, 1 passed** before implementation. Failures capture direct `/auth` showing an error, generic rather than contextual pending text, missing explicit consent, and outage retry starting OAuth instead of rechecking the session.
- Extended `authentication.mjs` with held admission/OAuth/callback responses and transient framework-error capture; it fails on the missing “Checking your session…” state. Added a held services response and shell-mount assertion to `service-workspace.mjs`.
- Built the unchanged SPA and observed a fresh anonymous `/` with mocked HTTP responses: **Loading editor… → GitHub fixture**, one automatic OAuth request, no captured TanStack error or uncaught exception. The sandbox-specific flash remains unconfirmed; a recording is still needed if it persists.
- Existing Playwright expects browser revision 1228, while the host has 1248. Used a temporary launch override pointing to the already-installed Chromium, with no installation or production dependency change. Temporary dev/static servers use ports 3015/3016; the pre-existing server on 3000 was left alone.

### Step 2 — auth journey

- Implemented explicit GitHub activation, action-local pending/retry, callback/session-specific progress, safe workspace return paths, and app-owned unexpected-route recovery. Added a shared `auth/auth-screen.tsx` for consistent entry layout and `src/route-error.tsx` for retry without document reload.
- Made `LoadingState` labels visible as part of the entry-screen dependency; `Loader` can now be decorative when that visible status supplies its name, so it is announced once. Broader loading boundaries remain step 3.
- Focused auth/loading tests: **41 passed**. Auth/workspace/admission suite: **65 passed, 1 existing expected failure**. Browser authentication suite passed against the local dev build, including delayed session/callback, keyboard consent, duplicate activation, denial/outage recovery, dirty-work protection, and a categories deep link.
- Typecheck exposed unrelated in-progress collections errors (additional field types/data-collections route renaming); own test typing errors were corrected. Recheck the current tree during final verification without modifying unrelated work.

### Step 3 — local loading and refresh states

- Services show a visible results-level loading status with existing skeletons. Network/5xx refresh failures retain cached rows with a retry notice; 401/403/404 remain blocking errors rather than being treated as fresh data.
- Service refresh errors stay inside the content region, with distinct session/access messages. Deleted services hide, but do not unmount, their cached page panes. Page-level wording stays “Loading page…” while its service/page/taxonomy dependencies arrive.
- The new background-read regression exposed a remaining page-pane defect: failed reads, including 401/403/404, were silently ignored after opening. Added explicit document notices/retry/download/sign-in actions without changing its draft, undo session, or save baseline.
- Focused suites: **146 passed, 1 existing expected failure** across 21 files. Browser service/workspace suite passes, including independently held services, service detail, page, and taxonomy reads; it verifies the same header stays mounted and cached navigation adds no loader.
- Stabilized the existing preloaded-list unit fixture so a live local API cannot replace its fixed rows mid-test; actual refresh scenarios use controlled HTTP responses.

### Step 4 — verification and documentation

- Updated the editor README, development notes, and API README for explicit consent, contextual loading, session recovery, and the limits of mocked OAuth checks. API implementation, admission, cookies, and schemas were not changed by this work.
- Final focused run: **21 files passed; 146 tests passed, 1 existing expected failure**. The full editor suite ran: **192 files passed, 2 failed; 1,355 tests passed, 2 failed, 1 expected failure**. The failures are the untouched collections identifier/refusal tests in `src/content/content-demo-model.test.ts` and `src/content/content-type-editor.test.tsx`.
- Before concurrent site-preview changes, all five selected browser suites passed against development with auth bypass off. Against the production-built SPA shell, authentication, service-workspace, remote-page-editing, and routing passed. `content-collections.mjs:233` fails its field-reorder focus assertion, reproduced again in isolation; collections production code and that suite were left untouched. The routing suite's separate immediate-focus assertion was changed to wait for the same required Cancel focus: a probe confirmed Base UI applies it after the popup becomes visible.
- A later rebuild included concurrent site-preview integration in `src/host/page-editor.tsx` and new `src/host/site-preview*` files. Authentication and the accessibility audit passed again, but `service-workspace.mjs:160` then timed out waiting for the former `article` named “Page preview”; the runner stopped before remote-page-editing/routing. The earlier browser/unit passes describe the tested snapshot, not a clean gate for these later preview changes. That unrelated implementation was preserved, not changed to satisfy old assertions.
- Production-shell accessibility checks passed: keyboard sign-in and retry, visible focus, automated axe WCAG checks on entry/pending/recovery screens, one contextual status, reduced motion, and 320px width with 200% text. Fixed and regression-tested narrow-layout logo overflow and clipped wrapped button text. This is not a manual screen-reader audit.
- Repository build passed for **23 projects**, excluding `landing`, with `VITE_API_ORIGIN=https://api.example.gov.bb`. Boundaries passed: **402 completed boundaries, 0 temporary legacy edges**. Changed-code lint passed. Full typecheck remains blocked by untouched collections field-type/state errors and the in-progress data-collections route rename. Full lint/format checks also flag `scripts/browser/site-preview-parity.mjs` and `src/content/data-collections-screen.tsx`. A concurrent workspace-wrapper edit in `src/routes/__root.tsx` added another formatting failure during final verification; it was preserved rather than reformatted as part of this task.
- Used the existing installed Playwright/Chromium only. Tests exercised delayed session/OAuth/callback/data responses, safe returns, sign-out/expiry, blocked departure, draft/undo preservation, and local refresh notices. The sandbox-specific TanStack flash was not reproduced, and no fix for its unknown cause is claimed. Real GitHub consent and deployment cookies still need an owner-assisted sandbox smoke test after deployment; a short recording is needed if the flash persists.

## PR verification — isolated branch

Base: `origin/v2-rewrite` at `fa141680`. Branch: `editor-v2-auth-loading`.

- Full editor suite: **179 files passed; 1,201 tests passed**.
- Editor typecheck, lint, formatting, and boundaries: **passed**; 397 completed boundaries, no temporary legacy edges.
- Repository build, excluding `landing`: **23 projects passed**, using `VITE_API_ORIGIN=https://api.example.gov.bb`.
- Browser suites **authentication, service-workspace, remote-page-editing, routing, and persistence-isolation** all passed against both development and the production-built SPA shell, with auth bypass off and the existing installed Playwright/Chromium.
- Browser callback coverage preserves an existing Services destination's search and fragment. The collection/category return-path allowlist has unit coverage; those UI routes belong to separate uncommitted work and are not introduced by this PR.
- No API implementation/schema, collections UI, visibility policy, history removal, or site-preview changes were pulled into this branch. The original working checkout and its reference-cleanup edits remain intact.
- Live GitHub consent/deployment cookies and the reported sandbox-only flash remain unverified; the browser checks use mocked HTTP responses.
