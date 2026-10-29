# Editable site preview

**Preview page → Edit content → Close preview** stays on the same authenticated CMS URL. It does not visit landing or use an iframe. The writer keeps its existing layout. Page Markdown tools have been removed from both surfaces; unsupported pages open read-only.

Title, introduction and body edit the same working copy and Lexical history. Opening, typing, blurring, toggling editing and closing preview never save or publish. Save/Publish, conflict choices, pending-save snapshots and departure protection remain owned by the workspace. Unsaved work remains in memory, not browser recovery storage.

The page's document bar is the only CMS chrome above the public page. It holds the title and save status, **Edit content** (a toggle, pressed while editing, with undo and redo beside it only then), **Close preview** in the writer's Preview page slot, **About this preview** (what preview can't do) and Publish. Page settings is not offered in preview, and the bar's title is not a heading there, as the public page has its own h1. Document notices, such as a newer version or a failed save, still appear under the bar.

## Ownership and runtime contract

- `apps/landing/src/preview/cms-preview.tsx` composes the normal public header, breadcrumbs, notices, `MarkdownContent`, feedback region and footer. It uses the ordinary Markdown pipeline and public CSS, not the older builder preview route.
- `apps/editor_v2/src/host/site-preview.tsx` loads that application-owned renderer and attaches CMS controls. No application imports the other's source; no shared package or second draft store is involved.
- The existing `EditorComposer` stays mounted. Its normal writer surface is unmounted during preview. `site-preview-inline.tsx` attaches the same Lexical editor to the body's slot and uses the existing metadata updates, insertion, formatting and block controls.

The renderer exports:

```ts
mountCmsPreview(container, document, assetBase): Promise<{
  update(document): Promise<void>
  setEditing(editing): { title: HTMLElement; lede: HTMLElement; body: HTMLElement } | null
  dispose(): void
}>
```

`document` carries original body Markdown, frontmatter, a local page path, breadcrumb labels/links, optional `formStatus` (`available`, `unavailable`, `maintenance`, `closed`) and optional `startSubPageVisible`. It is display input, not a persistence format. Landing validates the metadata it reads. The host never reconstructs Markdown from reader HTML.

`update` compiles asynchronously, ignores stale results and does not reset scroll. The host does not update reader content under a live editable root. It removes its portals before restoring reader regions or disposing the renderer. A memory router supplies public components' URL context without changing the browser location.

The CMS supplies category/service breadcrumbs and the server publication date. Missing dates remain missing. The current CMS has no live form-availability query, so reading mode hides conditional start actions. Editing shows source content, including conditional actions drawn as the writer draws its buttons, so it cannot silently discard it. Reader-generated phone links and heading decorations are only display output. Custom source blocks retain their editable structure; turning off Edit content shows their full public rendering.

## Styles and cleanup

The root document identifies its compiled stylesheet with `id="cms-stylesheet"` and its workspace with `data-cms-workspace`. The host reads that stylesheet's CSSOM and temporarily replaces global application styling with native CSS `@scope` regions for the CMS and public page. Root/body declarations are mapped to the appropriate scope root; public CSS is not copied into the writer or prefixed utility by utility.

CMS portals remain outside public prose styling. Editable regions receive only preview-specific adaptations in `site-preview.css`. On exit, error, navigation or inactive-pane cleanup, the original stylesheet is restored and temporary styles are removed. Closing preview returns focus to its trigger and restores the writing scroll position. Browsers without `CSSScopeRule` get a recoverable error and can continue using the writer.

The preview is a full-page CMS surface, not a modal dialog. The underlying workspace is hidden and inert while it is open. Its existing leave dialogs and formatting menus retain their own focus behavior.

## Build, delivery and trust

Build landing's renderer with:

```sh
pnpm --dir apps/landing build:cms-preview
```

This emits ignored `public/cms-preview/renderer.js` and `styles.css`. Landing's normal `dev` and `build` scripts build these first; its production output includes them under `.amplify-hosting/static/cms-preview/`. If starting Vite directly, build them explicitly. Rebuild them after changing landing rendering code; the browser entry is not a source-level HMR bridge.

Configure the CMS at build/dev-server start:

```dotenv
VITE_SITE_PREVIEW_URL=https://alpha.gov.bb/cms-preview/
```

Select the appropriate trusted landing deployment for the CMS environment. Changing this value requires rebuilding/restarting the CMS. HTTPS is required except for loopback development. Credentials, queries and fragments are rejected in this configuration URL. A missing configuration gives a recoverable error, never a local-renderer fallback.

The configured bundle executes in the CMS document: **it is trusted application code, not a sandbox for third-party renderers**. Authored URLs cannot choose it. Keep renderer and CMS releases compatible; deploy the renderer assets before enabling the CMS entry. Their CORS headers must allow module/CSS loading without credentials. The CMS CSP must allow that origin for scripts, styles/connections and images, and the embedded font data. `amplify.yml` permits the GovBB deployment estate and sets CORS/no-cache headers on the renderer assets. Verify those headers on the deployed environment; a local build is not deployment verification.

The preview rejects executable/embedded HTML, SVG/MathML and event/style attributes, and rejects unsafe source-notice URLs. It mounts no public application loaders or analytics. Preview links and submissions are intercepted; local fragment links can move focus within the preview. Feedback and application actions cannot submit. There is no public editing entry point, preview-token authentication or transmission of the working document to landing.

## Running browser checks

From the repository root, build the renderer and run landing and the CMS in separate terminals:

```sh
pnpm --dir apps/landing build:cms-preview
VITE_API_V2_URL= pnpm --dir apps/landing exec vite dev --port 3040 --host 127.0.0.1
VITE_API_ORIGIN=http://127.0.0.1:3061 \
  VITE_SITE_PREVIEW_URL=http://127.0.0.1:3040/cms-preview/ \
  pnpm --dir apps/editor_v2 exec vite dev --port 3060 --host 127.0.0.1
```

With an existing compatible Playwright/Chromium installation:

```sh
PLAYWRIGHT_MODULE_PATH=/path/to/playwright-core \
  pnpm --dir apps/editor_v2 exec node scripts/browser/site-preview.mjs http://127.0.0.1:3060
PLAYWRIGHT_MODULE_PATH=/path/to/playwright-core \
  pnpm --dir apps/editor_v2 exec node scripts/browser/site-preview-parity.mjs http://127.0.0.1:3040
```

The integrated suite mocks authentication/API responses at the HTTP boundary, not the editor or renderer. It compares the same mentor Markdown on the ordinary landing route and CMS at 390, 800, 1000 and 1440px; checks the bar as the only chrome above the page, single-editor ownership, a no-op preview, undo across surfaces, generated telephone links, formatting/insertion/tables, failed/late assets, cleanup, explicit publication, pending edits, conflicts and departure guards. Screenshots go to `/tmp/govbb-site-preview/`. A second URL argument after the CMS URL can select another locally served reference; it must serve the same fixture source.

The existing writer browser fixture also needs `VITE_SITE_PREVIEW_URL` in the test process environment, because it builds its own host bundle. Its intercepted document receives Chromium's local-network permission for local renderer assets; the production application does not request this permission. Stop/restart Vite development servers after production builds if their generated server artifacts were replaced.

Run the integrated suite again against production-built `dist/client`, serving assets normally and rewriting other application URLs to `/_shell.html`. A real deployment must additionally check CSP/CORS, real sign-in and API permissions. Narrow/reduced-height reflow and synthetic composing-Enter tests are automated; they do **not** replace a real phone keyboard, IME, screen reader or browser-zoom assessment.

## Preview-only branch verification

The preview branch includes `v2-rewrite` through `855dd10b`. Its newer explicit sign-in, contextual loading and removal of saved-version history are retained. Preview editing still shares the writer's local undo history. The diff against that base contains only preview integration, configuration, documentation and tests.

Checks on the merged candidate used fixture authentication/API data, not a live publishing account:

- All 23 non-landing Nx build targets passed (22 cache hits), as did the full landing and renderer builds.
- All 1,216 editor tests and all 709 landing tests passed. The earlier services-list failure is resolved by the upstream fixture change.
- Editor typechecking, lint, full formatting, all 400 boundaries and `git diff --check` passed. Landing lint passed with the three existing `no-shadow` warnings in `-preview-gating.test.ts`.
- The integrated suite passed against the production-built CMS and built renderer, with the ordinary landing development route as the reference. It checked public-page parity at 390, 800, 1000 and 1440px, inline editing/shared undo, cleanup and retries, menus, explicit saves, pending-save/conflict handling, departure guards and narrow reflow.
- Production-CMS authentication, remote-page, service-workspace and routing checks passed, including the absence of saved-version history controls/requests. Writer, link-editing and form-source fixtures also passed.

Landing typechecking still reports incompatible installed HAST 3.0.4/3.0.5 types in the unchanged `src/utils/markdown/processor.ts:43`. That dependency issue was not changed for preview. A fresh all-project test run was not performed.

Deployed CSP/CORS, real employee authentication/API authorization, real phone/IME behavior, screen-reader use and native 200% browser zoom remain unverified.
