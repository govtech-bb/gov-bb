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

## Workspace layout

Services, forms, and content share a collapsible sidebar and top bar. The sidebar
remembers its desktop state and lists the current service’s overview, application
form, and content pages. Small screens use a navigation drawer. The form editor
has a separate page outline; content editing has Write, Settings, and Preview tabs.
Ask AI opens a global panel that stays mounted while navigating the workspace.

## Services

The service library is the starting point. Each service has one optional
application and many content pages. The sidebar stays available throughout;
Ask AI is global and keeps its conversation while you navigate.

Create a service walks through three steps (name and category, application
form, department contact) and creates the service with its entry page. The
service overview then lists the journey in the order of the service content
standards (entry page, start page, supporting pages, application form,
confirmation, after submission) and the service details, each with its status
and one action; the header button always names the next unfinished step and
becomes **Publish** when everything is done. **Details** edits name, category,
contact and release in place; **After submission** holds delivery settings.
Department email uses
the existing contact directory. Webhooks and payments use the existing application
settings and processor editor. Saving these settings keeps the existing backend
behaviour; this change does not add release-pinned configuration.

Choose **Pages → Add page** for supporting pages such as `help`, or **Add start
page** from the overview when people must prepare before they begin; the entry
page's Start button then points at the start page.
Each page has its own identity and URL. AI proposals to create a page preserve
the open page. **Journey** shows page links, form pages, conditions, repeated pages,
confirmation, and delivery actions; its outline lets you reorder optional pages.

Service organisation, setup progress, and content drafts are saved in this
browser, scoped to the signed-in author. Form drafts use the existing API and
editing locks. The UI does not claim atomic saves across forms and content or
shared service drafts. Keep named Git versions when work needs to leave this
browser. A browser storage failure is reported without clearing the editor.

**History** saves public service files in one Git commit and retains a named tag.
Version shortcuts and recovery copies are kept in this browser. It also shows
existing Git history for any service page or application. Restoring keeps a local
recovery copy and retains the current environment's private configuration.
Existing form identities and published page URLs cannot be silently removed.

A selected version opens a PR containing the service manifest, pages, and recipe.
Source revisions and overlapping PRs are checked first. Git stores public files;
private payment and department settings continue to use the current API.
A merged PR is reported as merged, not as a verified live deployment.

**Preview service** captures the current snapshot, including unsaved editor
changes, and uses the real content and form renderers. Sample uploads, payments,
and submissions stay in preview. Set `VITE_LANDING_PREVIEW_URL` and
`VITE_FORMS_PREVIEW_URL` on the builder to absolute URLs ending in
`/preview-start-page` and `/preview-service`. Set `VITE_START_PAGE_EDITOR_ORIGIN`
on the receiving apps to the builder's exact origin. Development accepts local
loopback origins. Both origin and source window are checked.

No new `form_builder_api` endpoints, database migrations, release-preparation
commands, or submission-processing behaviour are required for this UI.

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
Apply. Service edits remain local until Save draft, except creating a separate
AI guidance page, which stores both content drafts in this browser after approval.
Publication always uses a selected named service version.

The root `GlobalAssistantProvider` keeps one conversation available across the
library and both editors. Editor adapters register the active document and its
guarded apply callback. Library conversations use Ask mode; edits require an open
form or content page. Moving to another document invalidates earlier approvals.

Conversations are stored on the current browser and scoped to the signed-in user’s
workspace. Restoring a conversation restores text only, never a draft or pending
approval. Delete chat removes its transcript and document reference.

Streams go directly to the API using a short-lived token obtained through an
authenticated server function. Configure the API's `CORS_ORIGIN` to include
this app's exact origin. The admin token stays on the server. See
[the architecture decision](../../docs/decisions/0072-builder-ai-streams-with-reviewed-client-edits.md).
