# GovBB editor v2

Page and form authoring for GovBB services. The workspace groups entry pages, supporting content and an application form or calculator, with a separate draft and undo history for each document.

Pages use Markdown with YAML frontmatter. Forms use native v2 JSON for import/export and versioned Markdown for drafts. Drafts are saved in the browser; publishing and application submission are not connected.

## Run locally

Use Node 24 and pnpm. From the repository root:

```sh
pnpm install
pnpm dev:editor_v2
```

Open `http://localhost:3000`. Set `PORT` to use another port, for example `PORT=3015 pnpm dev:editor_v2`. The app runs on TanStack Start and Vite in SPA mode.

## Checks

```sh
pnpm exec nx run-many -p editor_v2 -t build test typecheck lint format:check check:boundaries check:coverage
```

The static app is built into `apps/editor_v2/dist/client`. Serve existing assets first, then rewrite application URLs to `/_shell.html` with HTTP 200. The generated server build is used to create the shell; static hosting does not run it. Keep the same origin when migrating a deployment so existing browser drafts remain accessible.

Tests run with Vitest and cover forms, saved drafts and page conversion, including the current content in `apps/landing/src/content`.

## Working on the editor

- [Development](docs/DEVELOPMENT.md): focused tests, browser checks, draft storage and known issues.
- [Architecture](docs/ARCHITECTURE.md): editor modules, presets and host integration.
- [Examples](docs/examples/editor-system.tsx): page and form editors with optional draft storage.
- [Product scope](PRODUCT.md): supported authoring workflows and design conventions.
- [Documentation](docs/README.md): formats, converters and extension guides.
