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

Run [api_v2](../api_v2/README.md) with its GitHub authentication configuration first. Opening the editor automatically starts GitHub sign-in when no session exists; use a GitHub account with a verified email and active membership in `govtech-bb`. The API session expires after eight hours. The editor checks it on navigation, window focus and expiry, and verifies the session cookie after GitHub returns. Cancellation, denied accounts, unavailable authentication and blocked cookies stop at a recovery screen instead of restarting sign-in.

`VITE_API_ORIGIN` is the public API origin, defaulting to `http://localhost:3020` during development. Production builds require an explicit HTTPS origin. Both production origins must be on the same site for the API's host-only, SameSite cookies; the API's configured editor origin must match this app's origin exactly. Browser requests include credentials. Keep GitHub credentials and the Better Auth secret exclusively in the API environment.

Authentication gates the workspace; it does not publish or synchronize drafts. Signing out preserves local drafts and is blocked if the current draft cannot be safely saved. Browser storage remains local to this origin and is not separated by account.

## Checks

```sh
VITE_API_ORIGIN=https://api.example.gov.bb pnpm exec nx run-many -p editor_v2 -t build test typecheck lint format:check check:boundaries check:coverage
```

The static app is built into `apps/editor_v2/dist/client`. Serve existing assets first, then rewrite application URLs to `/_shell.html` with HTTP 200. The generated server build is used to create the shell; static hosting does not run it. Keep the same origin when migrating a deployment so existing browser drafts remain accessible.

`/auth` is a public SPA route for OAuth completion, errors and signed-out recovery. The GitHub provider callback is served by the API at `/api/auth/callback/github`; the editor never handles provider tokens.

Tests run with Vitest and cover forms, saved drafts and page conversion, including the current content in `apps/landing/src/content`.

## Working on the editor

- [Development](docs/DEVELOPMENT.md): focused tests, browser checks, draft storage and known issues.
- [Architecture](docs/ARCHITECTURE.md): editor modules, presets and host integration.
- [Examples](docs/examples/editor-system.tsx): page and form editors with optional draft storage.
- [Product scope](PRODUCT.md): supported authoring workflows and design conventions.
- [Documentation](docs/README.md): formats, converters and extension guides.
