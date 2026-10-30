# Editable site preview

**Preview page → Edit content → Close preview** stays on the same authenticated CMS URL. It does not visit landing or use an iframe. The writer keeps its existing layout. Page Markdown tools have been removed from both surfaces; unsupported pages open read-only.

Title, introduction and body edit the same working copy and Lexical history. Opening, typing, blurring, toggling editing and closing preview never save or publish. Save/Publish, conflict choices, pending-save snapshots and departure protection remain owned by the workspace. Unsaved work remains in memory, not browser recovery storage.

The page's document bar is the only CMS chrome above the public page. It holds the title and save status, **Edit content** (a toggle, pressed while editing, with undo and redo beside it only then), **Close preview** in the writer's Preview page slot, **About this preview** (what preview can't do) and Publish. Page settings is not offered in preview, and the bar's title is not a heading there, as the public page has its own h1. Document notices, such as a newer version or a failed save, still appear under the bar.

## Ownership and runtime contract

- `apps/landing/src/preview/cms-preview.tsx` composes the normal public header, breadcrumbs, notices, `MarkdownContent`, feedback region and footer. It uses the ordinary `govbbmarkd` pipeline and public CSS, not the older builder preview route.
- `apps/editor_v2/src/host/site-preview.tsx` loads that renderer from the editor's own deployment and attaches CMS controls. No application imports the other's source, and there is no second draft store.
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

The editor's normal `dev` and `build` scripts build the renderer first. To rebuild only its assets:

```sh
pnpm --dir apps/landing build:cms-preview
```

This generates `dist/editor-site-preview/` at the repository root:

- `cms-preview/renderer.js` and `cms-preview/styles.css`, with embedded design-system fonts.
- `images/`, copied from landing's public images for both branding and existing Markdown image paths.

Editor Vite uses that tree as its public directory. The production build includes it in `apps/editor_v2/dist/client`; landing no longer generates or deploys the preview assets. No landing server, preview URL setting or live forms/API build is needed. If starting editor Vite directly, generate the assets first. Rebuild after changing landing components or styles; this separate browser bundle does not use source-level HMR.

Nx tracks landing and `govbbmarkd` changes as editor build inputs and restores both generated output directories from cache. The editor builds its required packages, not the full `landing:build`. The sandbox deployment workflow also watches these sources.

The host always loads `/cms-preview/` from its own origin. Authored URLs cannot select executable code or styles. The preview bundle supplies display-only chat/forms/tracker destinations because navigation is intercepted; landing's real production configuration checks are unchanged.

The bundle executes beside CMS credentials, so it retains its markup and URL checks. It rejects executable/embedded HTML, SVG/MathML and event/style attributes, plus unsafe source-notice URLs. It mounts no public application loaders or analytics. Local fragment links can move focus within the preview, but feedback and application actions cannot navigate or submit. Drafts never leave the editor for rendering.

`amplify.yml` permits same-origin scripts and embedded fonts, and sets `Cache-Control: no-cache` on the fixed-name renderer/CSS/images. Cross-origin renderer CORS and script permissions are no longer needed. Deploy the self-contained editor before retiring old landing-hosted assets still used by an older editor. No cloud environment-variable change is required.

## Running browser checks

Start only the editor for the preview smoke, writer and workspace suites:

```sh
PORT=3060 VITE_API_ORIGIN=http://127.0.0.1:3061 \
  pnpm --dir apps/editor_v2 dev --host 127.0.0.1

# In another terminal, using an existing Playwright/Chromium installation:
PLAYWRIGHT_MODULE_PATH=/path/to/playwright-core \
  pnpm --dir apps/editor_v2 exec node scripts/browser/site-preview-smoke.mjs http://127.0.0.1:3060
```

The smoke opens the actual editor with employee/page API fixtures, changes an unsaved title, opens preview, edits the introduction, closes and undoes both changes. It checks same-origin assets, MIME/cache headers and branding images. Unexpected requests and all mutations are blocked. It neither signs in a real employee nor writes to the content API.

Public-page parity additionally needs an ordinary landing page as an independent reference, not as a preview asset server:

```sh
VITE_API_V2_URL= pnpm --dir apps/landing exec vite dev --port 3040 --host 127.0.0.1

PLAYWRIGHT_MODULE_PATH=/path/to/playwright-core \
  pnpm --dir apps/editor_v2 exec node scripts/browser/site-preview.mjs http://127.0.0.1:3060 http://127.0.0.1:3040
PLAYWRIGHT_MODULE_PATH=/path/to/playwright-core \
  pnpm --dir apps/editor_v2 exec node scripts/browser/site-preview-parity.mjs http://127.0.0.1:3040 http://127.0.0.1:3060
```

The integrated suite compares the same mentor Markdown at 390, 800, 1000 and 1440px. It checks the document bar, single-editor ownership, shared undo, generated telephone links, formatting/insertion/tables, failed/late assets, retry and cleanup, explicit saves, pending edits, conflicts and departure guards. Geometry assertions use reduced motion to compare resting layouts, not sidebar transitions. Screenshots go to `/tmp/govbb-site-preview/`.

Writer fixtures build their own host bundle but load preview assets from the same editor URL. They need no separate preview configuration. Stop/restart development servers after production builds if their generated server artifacts were replaced.

Run the smoke and integrated suite against production-built `dist/client` too. Serve existing assets normally and rewrite application URLs to `/_shell.html`. A missing JS/CSS file must fail, not return the SPA shell as a successful asset response.

## Deployment checks and limits

After Amplify succeeds, `deploy-editor-v2-sandbox.yml` runs the smoke against the deployed editor in a separate job without AWS credentials. It tests the real deployed UI, assets and browser-enforced CSP, while authentication and API responses remain fixtures. This is not evidence of real employee authorization.

For release acceptance, an authorized employee should open the reported service page, make an unsaved edit, open/close preview and confirm the working copy is intact with no save/publish request. Do not publish test content.

Narrow/reduced-height reflow and synthetic composing-Enter tests do not replace real phone/IME, screen-reader or browser-zoom checks.
