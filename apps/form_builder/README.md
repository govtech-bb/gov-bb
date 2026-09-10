# @govtech-bb/form-builder-app

The visual authoring tool for form **recipes** (the JSON definitions that drive
the forms platform). A unified editor — steps, fields, validations, behaviours,
processors — with an AI assistant for forms and content pages. It streams answers, reads
PDFs/images, and presents changes for review before applying them to the draft.

> The app is `@govtech-bb/form-builder-app`; it consumes the
> `@govtech-bb/form-builder` **package** (recipe authoring/hydration utilities).
> Don't confuse the two.

For the editor model, AI sidebar contract, and recipe domain see
[SPEC.md](./SPEC.md). For recipe conventions see the root
[FORM-CREATION-GUIDE.md](../../FORM-CREATION-GUIDE.md) and [FORMS.md](../../FORMS.md).

## Stack

Vite + React · TanStack Start + TanStack Router · dnd-kit (drag-and-drop field
reorder) · TanStack AI + TanStack Markdown (assistant) · deployed to AWS Amplify Compute (Nitro SSR).

## Running

```bash
pnpm exec nx dev form-builder-app   # from repo root
# or
cd apps/form_builder && pnpm dev
```

Copy [`.env.example`](./.env.example) to `.env`. Key variables:

- `BUILDER_API_URL` — the browser-reachable form_builder_api base URL; required for AI streaming (use `http://localhost:3003` locally)
- `API_BASE_URL` — apps/api base URL, for the "Open published form" modal
- `VITE_FORMS_URL` / `VITE_RECIPE_PREVIEW_TOKEN` — preview links into the forms app
- `GITHUB_OAUTH_CLIENT_ID` / `GITHUB_OAUTH_CLIENT_SECRET` / `SESSION_SECRET` /
  `GITHUB_ORG` / `GITHUB_TEAM_SLUG` — access is gated by GitHub team membership
- `PUBLISH_BASE_BRANCH` — the branch publish PRs target

## Tests

```bash
pnpm exec nx test form-builder-app   # Vitest 4
```

## Code organization

- `app/routes` owns route configuration, page composition, and page-level state.
  Route-local tests use a leading `-` so TanStack excludes them from routing.
- `app/components/builder` and `app/components/content` group each editor's
  controls, dialogs, private hooks, helpers, and tests.
- `app/components/body-editor` contains the rich-text editor shared by both
  editors, including its nodes, plugins, markdown conversion, and tests.
- `app/components/ui` owns shared UI primitives and the shared AI assistant;
  feature-specific assistant adapters live with their editor components.
- `app/hooks` holds shared theme and persisted-state hooks. Browser-safe content
  helpers live in `app/lib`; server functions and markdown serialization live
  in `app/server`.

Style components with Tailwind utilities and the shared `ui-*` color tokens.
Keep shared theme and animation definitions in `app/components/ui/styles`;
`app/styles/builder.global.css` supplies the page defaults. Use `cn` when
combining utilities with conditional overrides. JavaScript should select
elements by a data attribute or ref rather than by their styling classes.

Import modules directly. Keep small page-local helpers with their page and use
existing UI primitives instead of adding forwarding wrappers. Components and
shared helpers must not import route modules.

Keep dialogs mounted and control their visibility with `open`. Let the dialog
portal finish its closing animation before resetting local input; retain the
selected item and result content throughout that animation.

## Build & deploy

`pnpm build` runs `vite build` then `scripts/patch-amplify-manifest.mjs` to fix
the Amplify Compute manifest. Deploys as SSR on Amplify; branch names used for
PR previews must not contain a `.` (see the root [CLAUDE.md](../../CLAUDE.md)).

## AI assistant

Shared AI UI lives in `app/components/ui/ai`; form and content adapters live in
their respective component groups. Ask mode answers questions; Review
edits shows a normalized before/after comparison and validation warnings before
Apply. Changes remain local until the existing Save or Deploy action.

Conversations are stored on the current browser, scoped to the signed-in user
and artifact. Restoring a conversation restores text only, never a draft or
pending approval. Delete chat removes its transcript and document reference.

Streams go directly to the API using a short-lived token obtained through an
authenticated server function. Configure the API's `CORS_ORIGIN` to include
this app's exact origin. The admin token stays on the server. See
[the architecture decision](../../docs/decisions/0072-builder-ai-streams-with-reviewed-client-edits.md).
