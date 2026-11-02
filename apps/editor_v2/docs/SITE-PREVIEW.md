# Editable site preview

**Preview page → Edit content → Close preview** stays on the authenticated editor URL. Opening, editing and closing never save, publish, navigate or discard the working copy. The existing Lexical editor owns both surfaces and their undo history.

## Local prose template

`src/templates/prose-page.tsx` assembles the public-page layout from `@govtech-bb/react`: official banner, header, breadcrumbs, title, introduction, publication date, notices, feedback and footer. It uses `@govtech-bb/frontend` for styles, fonts and branding. `govbbmarkd` supplies the Markdown renderer, retained legacy blocks and form-link transformations shared with landing.

Vite builds this as ordinary editor code. There is no landing build dependency, standalone renderer bundle, generated asset directory, runtime module URL or `VITE_SITE_PREVIEW_URL` setting. Branding comes from the design-system package. Authored images retain their URLs; legacy `/images/...` references resolve against the public site.

The template has no authentication, API, analytics, router or persistence code. It accepts prepared display data and optional editor-owned title, introduction and body regions. `src/host/site-preview-inline.tsx` supplies the existing fields and `ContentEditable`, not another editor or draft store.

The page template mirrors landing's prose layout; changes to that layout need the parity check below. Both applications use the same design-system and Markdown packages. This does not promise that an editor release matches a different version currently deployed on landing.

## Styles and lifecycle

The template's stylesheet is built from the design-system CSS and Tailwind tokens. A native CSS scope contains it within the preview and excludes editor controls. The package's document defaults apply to the template root. The editor's stylesheet stays active and is never rewritten or disabled.

The template and its scoped styles unmount together. Closing restores writer focus and scroll. The underlying workspace is hidden and inert while preview is open. Browsers without CSS scope support get a recoverable error and can keep using the writer.

Save/Publish, conflicts, pending-save snapshots and departure protection remain workspace concerns. The document bar owns preview controls; the template owns the public presentation.

## Content safety and limitations

`prose-page-content.ts` validates display metadata and rejects executable or embedded HTML before rendering legacy Markdown. The shared compiler validates content URLs. Preview intercepts navigation and submission; local fragment links may only target elements inside the preview.

Publication dates come from the server snapshot and are absent when unknown. The editor has no live form-availability query, so unknown form destinations remain hidden. Editing shows the original working content. Preview navigation, feedback and application actions do not perform real actions.

## Checks

Start the editor normally; no separate asset generation is needed:

```sh
PORT=3060 pnpm --dir apps/editor_v2 dev --host 127.0.0.1
```

Run the short no-write smoke with an existing Playwright/Chromium installation:

```sh
PLAYWRIGHT_MODULE_PATH=/path/to/playwright-core \
  pnpm --dir apps/editor_v2 exec node scripts/browser/site-preview-smoke.mjs http://127.0.0.1:3060
```

It loads the real UI with fixture authentication/API responses, types an unsaved title, opens preview, checks content and branding, then closes without losing the edit. All mutations, old renderer requests and unexpected remote requests are blocked. The sandbox deployment runs this check in a read-only job after Amplify succeeds.

For independent public-page parity, start landing as a reference only:

```sh
VITE_API_V2_URL= pnpm --dir apps/landing exec vite dev --port 3040 --host 127.0.0.1

PLAYWRIGHT_MODULE_PATH=/path/to/playwright-core \
  pnpm --dir apps/editor_v2 exec node scripts/browser/site-preview-parity.mjs http://127.0.0.1:3040 http://127.0.0.1:3060
PLAYWRIGHT_MODULE_PATH=/path/to/playwright-core \
  pnpm --dir apps/editor_v2 exec node scripts/browser/site-preview.mjs http://127.0.0.1:3060 http://127.0.0.1:3040
```

Parity covers 390, 800, 1000 and 1440px. The integrated suite also covers inline editing, shared undo, style isolation, recovery, inactive panes, explicit saves, conflicts and departure guards. Screenshots go to `/tmp/govbb-site-preview/`.

These scripts also accept production-built editor output: serve `dist/client` assets normally, with application routes falling back to `/_shell.html`. Do not return the shell for missing JS/CSS.

## Release acceptance

Fixture tests do not prove real employee authorization. After deployment, an authorized employee should open the reported service page, make an unsaved edit, open/close preview and confirm that no save/publish request occurs. Do not publish test content. Real phone/IME, screen-reader and browser-zoom checks remain separate.
