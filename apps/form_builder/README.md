# @govtech-bb/form-builder-app

The visual authoring tool for form **recipes** (the JSON definitions that drive
the forms platform). A unified editor — steps, fields, validations, behaviours,
processors — with a collapsible AI sidebar that converts PDFs/text into recipes
and applies edits to the live draft.

> The app is `@govtech-bb/form-builder-app`; it consumes the
> `@govtech-bb/form-builder` **package** (recipe authoring/hydration utilities).
> Don't confuse the two.

For the editor model, AI sidebar contract, and recipe domain see
[SPEC.md](./SPEC.md). For recipe conventions see the root
[FORM-CREATION-GUIDE.md](../../FORM-CREATION-GUIDE.md) and [FORMS.md](../../FORMS.md).

## Stack

Vite + React · TanStack Start + TanStack Router · dnd-kit (drag-and-drop field
reorder) · TanStack AI (sidebar) · deployed to AWS Amplify Compute (Nitro SSR).

## Running

```bash
pnpm exec nx dev form_builder   # from repo root
# or
cd apps/form_builder && pnpm dev
```

Copy [`.env.example`](./.env.example) to `.env`. Key variables:

- `BUILDER_API_URL` — the form_builder_api base URL (default `http://localhost:3003`)
- `API_BASE_URL` — apps/api base URL, for the "Open published form" modal
- `VITE_FORMS_URL` / `VITE_RECIPE_PREVIEW_TOKEN` — preview links into the forms app
- `GITHUB_OAUTH_CLIENT_ID` / `GITHUB_OAUTH_CLIENT_SECRET` / `SESSION_SECRET` /
  `GITHUB_ORG` / `GITHUB_TEAM_SLUG` — access is gated by GitHub team membership
- `PUBLISH_BASE_BRANCH` — the branch publish PRs target

## Tests

```bash
pnpm exec nx test form_builder   # Vitest 4
```

## Build & deploy

`pnpm build` runs `vite build` then `scripts/patch-amplify-manifest.mjs` to fix
the Amplify Compute manifest. Deploys as SSR on Amplify; branch names used for
PR previews must not contain a `.` (see the root [CLAUDE.md](../../CLAUDE.md)).
