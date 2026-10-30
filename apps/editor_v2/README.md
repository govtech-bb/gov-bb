# GovBB editor v2

API-backed service page authoring for GovBB. The workspace groups entry, start and supporting pages, with independent in-memory edits and undo history.

Pages use Markdown with YAML frontmatter. Edits remain in memory until the author chooses **Save** or **Publish changes**. There is no browser draft persistence or autosave. Reusable form editors, presets and native v2 JSON/Markdown converters remain available for embedding, but form authoring is not a workspace flow.

## Run locally

Use Node 24 and pnpm. From the repository root:

```sh
pnpm install
pnpm dev:editor_v2
```

Open `http://localhost:3000`. Set `PORT` to use another port, for example `PORT=3015 pnpm dev:editor_v2`. The app runs on TanStack Start and Vite in SPA mode.

The `dev` and `build` scripts also build the public-page preview from landing's components and `govbbmarkd`. The editor serves the renderer, styles and images itself; preview needs no landing server or URL setting. See [Site preview](docs/SITE-PREVIEW.md) for its build and browser checks.

Run [api_v2](../api_v2/README.md) with its GitHub authentication configuration first. Opening the editor checks your session, then offers **Continue with GitHub** if you are signed out. Only that action starts sign-in; use a GitHub account with a verified email and active membership in `govtech-bb`. The API session expires after eight hours. The editor checks it on workspace entry, window focus and expiry, reuses an unexpired admission between workspace screens, and verifies the session cookie after GitHub returns. Cancellation, denied accounts, unavailable authentication and blocked cookies stop at a recovery screen instead of restarting sign-in.

`VITE_API_ORIGIN` is the public API origin, defaulting to `http://localhost:3020` during development. Production builds require an explicit HTTPS origin. Both production origins must be on the same site for the API's host-only, SameSite cookies; the API's configured editor origin must match this app's origin exactly. Browser requests include credentials. Keep GitHub credentials and the Better Auth secret exclusively in the API environment.

For local development without GitHub, run `vite dev` with `VITE_AUTH_BYPASS=true` and start api_v2 with `AUTH_BYPASS=true`. The editor then treats you as signed in. Builds ignore the flag, and the API refuses its own flag outside a local setup.

`VITE_LANDING_ORIGIN` is the optional public site origin. When set, each service's path in the Services list links to its page there.

Authentication gates the workspace and saving sends the page to the content API with the session. Leaving unsaved work, signing out or an expired-session redirect asks before discarding it; a pending save blocks departure. Cancel keeps the working copy and undo history. Unsaved work is lost on a crash, refresh, closed tab or confirmed departure; download a copy before leaving if it cannot be saved.

## Checks

```sh
VITE_API_ORIGIN=https://api.example.gov.bb pnpm exec nx run-many -p editor_v2 -t build test typecheck lint format:check check:boundaries check:coverage
```

The static app is built into `apps/editor_v2/dist/client`. Serve existing assets first, then rewrite application URLs to `/_shell.html` with HTTP 200. The generated server build creates the shell; static hosting does not run it. Old browser drafts are intentionally ignored and left untouched, without migration or recovery. Clipboard data and UI preferences are unchanged.

`/auth` is a public SPA route for explicit sign-in, OAuth completion, errors and signed-out recovery. Session-check recovery retries the session check without automatically starting OAuth. Loading messages name the waiting task; ordinary content reads keep the workspace mounted, and transient refresh failures retain usable cached data with a local notice. The GitHub provider callback is served by the API at `/api/auth/callback/github`; the editor never handles provider tokens.

Tests run with Vitest and cover in-memory editing, explicit API saves, forms and page conversion, including the current content in `apps/landing/src/content`.

## Working on the editor

- [Development](docs/DEVELOPMENT.md): focused tests, browser checks, save/leave behavior and known issues.
- [Architecture](docs/ARCHITECTURE.md): editor modules, presets and host integration.
- [Examples](docs/examples/editor-system.tsx): page and form editors with optional in-memory source binding.
- [Product scope](PRODUCT.md): supported authoring workflows and design conventions.
- [Documentation](docs/README.md): formats, converters and extension guides.
