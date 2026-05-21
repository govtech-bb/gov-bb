# Improved Form Builder Deployment — Implementation Plan

**Date:** 2026-05-21
**Branch:** `service/improved-formbuilder-deployment`
**Reference spec:** [`docs/superpowers/specs/2026-05-21-improved-formbuilder-deployment-design.md`](../superpowers/specs/2026-05-21-improved-formbuilder-deployment-design.md)
**Issue:** [#30](https://github.com/govtech-bb/gov-bb/issues/30) (linked: [#11](https://github.com/govtech-bb/gov-bb/issues/11))

---

## Goal

Ship the Hybrid (git + DB) recipe-deployment model in four committable phases. Each phase delivers a working app and a reviewable PR against `dev`.

---

## Approach

Build bottom-up along the runtime dependency chain: the API has to *read* recipes from files before the builder can usefully *write* them, and writes need auth before public write endpoints can be retired. Phase 4 (emergency disable) is last because it depends on the override-aware read path being live and on the auth surface stood up in Phase 2.

**Considered alternatives:**

- **Ship publish-via-PR first, file loader second.** Rejected — the moment the builder opens a PR, the merged file is dead weight until the API knows how to read files. File-loader-first means each published recipe is immediately load-bearing.
- **Single PR for the whole branch.** Rejected — the diff would span API, builder, infra, and a data migration. Phasing is what makes review possible.
- **Skip the migration script; backfill recipes by re-publishing from the builder.** Rejected — every existing form would have to be republished via PR before the file loader had anything to serve. Migration script does it in one commit.

---

## Phase 1 — File loader + canonical recipe export

**Goal:** API serves recipes from disk. Existing recipes are exported to `recipes/`. DB stops being a production read source.

Structured as one PR with four sequential commits.

### Scope

**1.a — Add `RecipeFileLoader` (with DB fallback)**

- `apps/api/src/forms/recipe-file-loader/recipe-file-loader.service.ts` — implements `OnModuleInit`; scans `recipes/{formId}/{version}.json` under the directory at `process.env.RECIPES_DIR ?? <repoRoot>/recipes`; validates each via Zod from `@govtech-bb/form-types`; builds an in-memory `Map<formId, { latest: ServiceContractRecipe; versions: string[] }>`. Bad files are logged and skipped, not fatal.
- `apps/api/src/forms/recipe-file-loader/recipe-file-loader.service.spec.ts` — fixtures cover happy path, malformed JSON, missing fields, multiple versions (selects highest).
- `apps/api/src/forms/recipe-file-loader/recipe-file-loader.module.ts`.
- File-watch in dev only (`NODE_ENV === 'development'`): `chokidar` (or `fs.watch`) reloads single entries on change. No watcher in prod.
- Wire `FormDefinitionsService.findByFormId` to ask the loader first, fall back to DB only on miss. Add a `WARN` log on every DB fallback hit so the migration's completeness is observable.

**1.b — Migration script + canonical-form lint**

- `scripts/export-recipes-to-files.ts` — connects via the existing `@govtech-bb/database` `createDataSource()`; reads every distinct `(formId, version)` from `form_definitions`; writes each to `recipes/{formId}/{version}.json` in canonical form (2-space indent, sorted keys, trailing newline). Idempotent.
- `scripts/lint-recipes.ts` — re-canonicalizes every file under `recipes/`, asserts no diff. Run in CI as a new `pnpm run lint:recipes` step.
- Add `lint:recipes` to the appropriate CI workflow (`.github/workflows/*`).

**1.c — Run the migration**

- Execute `scripts/export-recipes-to-files.ts` against the dev DB.
- Commit the resulting `recipes/` tree as its own commit, message naming the source DB snapshot date.
- Manually spot-check a couple of files against the corresponding DB rows.

**1.d — Remove the DB fallback**

- Delete the fallback branch in `FormDefinitionsService.findByFormId`. A missing file is now a 404.
- Remove the `WARN` log.

### Infra

- **Dockerfile (API):** add `COPY recipes/ /app/recipes/` so the Fargate image bundles them.
- **docker-compose.dev.yml:** bind-mount `./recipes` into the API container so dev hot-reload works against the host filesystem.

### Files (new)

```
apps/api/src/forms/recipe-file-loader/
├── recipe-file-loader.service.ts
├── recipe-file-loader.service.spec.ts
└── recipe-file-loader.module.ts

scripts/
├── export-recipes-to-files.ts
└── lint-recipes.ts

recipes/                              # populated by 1.c
└── {formId}/
    └── {version}.json
```

### Files (modified)

- `apps/api/src/forms/form-definitions/form-definitions.service.ts`
- `apps/api/src/forms/forms.module.ts` (register new module)
- `apps/api/Dockerfile` (or wherever `COPY` is)
- `docker-compose.dev.yml`
- One CI workflow under `.github/workflows/`

### Verify

- `GET /form-definitions/:formId` returns the same hydrated contract as `main` for every form. Drive this with the existing repo's smoke tests if any, or a manual sweep through `apps/web`.
- `pnpm run lint:recipes` exits 0 on a clean tree, non-zero on a hand-edited file with shuffled keys.
- Loader spec passes.
- After 1.d, `GET /form-definitions/some-unknown-form` returns 404, not a DB lookup.

---

## Phase 2 — Builder GitHub OAuth + Publish-via-PR

**Goal:** Authors log in with GitHub; "Publish" opens a PR that adds the recipe under `recipes/{formId}/{version}.json` on a branch cut from `dev`.

### Scope

**2.a — GitHub App (manual, one-time)**

- Create a GitHub App in the `govtech-bb` org. Permissions: `contents: write`, `pull_requests: write`, `metadata: read`. Configured for user-to-server tokens (so authors are the commit author).
- Capture App ID, client ID, client secret, private key (PEM). Add `.env.example` entries for the builder.

**2.b — Session + auth routes on the builder**

- `apps/form_builder/app/server/session.ts` — signed-cookie session helpers. Library: `iron-session` (mature, framework-agnostic, ships its own crypto). Cookie holds `{ githubLogin, accessToken (encrypted by iron-session), teamMemberships: string[], expiresAt }`. TTL 8h.
- `apps/form_builder/app/routes/auth/login.tsx` — server-side redirect to `https://github.com/login/oauth/authorize?...`.
- `apps/form_builder/app/routes/auth/callback.tsx` — exchanges code for user token; fetches `/user` and `/user/teams`; writes session cookie; redirects to `/builder`.
- `apps/form_builder/app/routes/auth/logout.tsx` — clears cookie.
- `apps/form_builder/app/server/auth-middleware.ts` — helper used by every server function. Two levels: `requireSession()` and `requirePublisher()` (checks team membership against the configured team slug).
- Apply `requireSession()` to every existing server function in `apps/form_builder/app/server/forms.ts` and `registry.ts`.

**2.c — Publish service + server function**

- `apps/form_builder/app/server/github-publish.ts` — wraps `@octokit/rest`. One exported `openPublishPr({ formId, version, recipe, prDescription, userToken })` that:
  1. Gets `dev` ref SHA.
  2. Creates branch `formbuilder/publish-{formId}-{version}-{shortHash}` (short hash = first 7 chars of SHA256(formId + version + ISO timestamp), so concurrent publishes don't collide).
  3. PUT contents to `recipes/{formId}/{version}.json` with the recipe serialized in canonical form.
  4. Opens PR against `dev` with title `Publish {formId} v{version}` and the supplied description.
  5. Returns `{ prUrl, prNumber }`.
- `apps/form_builder/app/server/forms.ts` — add `publishRecipe` server function:
  1. `requirePublisher()`.
  2. `validateFormContract(recipe)` from `@govtech-bb/form-builder`.
  3. Call `openPublishPr` with the session's user token.
  4. Return PR URL.

**2.d — Builder UI**

- Replace existing submit modal with a new `-publish-modal.tsx`:
  - Pre-publish validation result (existing validate path).
  - PR description textarea (defaults to `Publishes {formId} v{version} via Form Builder`).
  - Submit button → `publishRecipe` → on success, displays PR URL with "Open PR" link in new tab.
- Update toolbar: show logged-in GitHub user; "Sign out" action; disable "Publish" when not in publish team.
- Login screen at `/` redirects unauthenticated users to `/auth/login`.

**2.e — Stop persisting "publish" state in DB**

- `submitRecipe` always writes `publishedAt = null`.
- `updateRecipe` drops the "Cannot update a published recipe" guard (publishing isn't a column flip anymore). Keep the version-match guard.

### Files (new)

```
apps/form_builder/app/
├── server/
│   ├── session.ts
│   ├── auth-middleware.ts
│   └── github-publish.ts
└── routes/
    ├── auth/
    │   ├── login.tsx
    │   ├── callback.tsx
    │   └── logout.tsx
    └── builder/
        └── -publish-modal.tsx
```

### Files (modified)

- `apps/form_builder/app/server/forms.ts` (add `publishRecipe`, gate existing fns)
- `apps/form_builder/app/server/registry.ts` (gate)
- `apps/form_builder/app/routes/builder/index.tsx` (toolbar, route guard, swap modal)
- `apps/form_builder/app/routes/builder/-toolbar.tsx`
- `apps/form_builder/package.json` (`@octokit/rest`, `iron-session`)
- `apps/form_builder/.env.example`

### Verify

- Cold load → redirect to GitHub → consent → back to `/builder` with session.
- Edit recipe → Save → DB row appears with `published_at IS NULL`.
- Publish → PR appears in `govtech-bb/gov-bb` with the recipe file at the right path in canonical form; PR description matches the user's input; commit author is the staff member.
- Logged-out user hitting any server function gets 401.
- Logged-in user without publish-team membership: publish button disabled; direct server call returns 403.

---

## Phase 3 — Remove unauthenticated write endpoints

**Goal:** Close [#11](https://github.com/govtech-bb/gov-bb/issues/11). The public API has no recipe-mutating endpoints.

### Scope

- Audit `apps/api/src/forms/` for any controller that writes to `form_definitions` or related tables. Initial reading suggests only `FormDefinitionsController` (read-only) and `FormDraftsController` (which operates on user *submission* drafts, not recipe drafts — leave alone). Confirm under audit.
- Remove any write routes that aren't already gone. None of these should be needed at runtime — the builder writes via its own server functions (which talk to TypeORM, not the API).
- Add controller-level integration tests that `POST/PUT/PATCH/DELETE /form-definitions/*` returns 404/405.
- If the audit turns up writes that *are* still in use, plan a follow-up rather than blocking this phase — document and surface, do not silently leave them.

### Files (modified)

- `apps/api/src/forms/form-definitions/form-definitions.controller.ts` (only if writes are present; expected unchanged)
- `apps/api/src/forms/form-definitions/form-definitions.controller.spec.ts` (assertions)
- Anything else the audit surfaces.

### Verify

- `curl -X POST .../form-definitions/...` → 404/405 in a running API.
- Existing read-path tests still pass.
- `apps/web` and the builder both still work end-to-end.

---

## Phase 4 — Emergency disable

**Goal:** Staff can disable a single broken form within one request, without a deploy.

### Scope

**4.a — Schema + entity**

- TypeORM migration `CreateRecipeOverridesTable.ts` (in `packages/database/src/migrations/`):
  ```
  recipe_overrides
    form_id        varchar(100)  PRIMARY KEY
    disabled       boolean       NOT NULL DEFAULT false
    disable_reason text          NULL
    actor          varchar(255)  NULL
    created_at     timestamp     NOT NULL DEFAULT now()
    updated_at     timestamp     NOT NULL DEFAULT now()
  ```
- `packages/database/src/entities/recipe-override.entity.ts`.
- Re-export from `@govtech-bb/database`.

**4.b — Repository + read-path integration**

- `apps/api/src/forms/recipe-overrides/recipe-override.repository.ts`.
- `apps/api/src/forms/recipe-overrides/recipe-overrides.module.ts`.
- `FormDefinitionsService.findByFormId`: check overrides before consulting the loader. If `disabled = true`, throw a domain error that maps to HTTP 410 with `{ message: "Form temporarily unavailable", reason: ... }`.

**4.c — Admin endpoint**

- `apps/api/src/forms/recipe-overrides/recipe-overrides.controller.ts`:
  - `POST /admin/recipe-overrides` (set disabled + reason; actor inferred from auth context)
  - `DELETE /admin/recipe-overrides/:formId` (re-enable)
- Auth: reuse the GitHub OAuth + team check from Phase 2. The cleanest path is a small `GithubAuthGuard` that takes a `Bearer` token from the request, hits `/user` and `/user/teams` (cached short-TTL), and authorises against a configured *admin* team slug. This adds a new auth surface to the API — small, single-purpose, no session, no cookies.
- No UI in this branch. Use `curl` / a small CLI snippet documented in the PR description.

### Files (new)

```
packages/database/src/
├── entities/recipe-override.entity.ts
└── migrations/{timestamp}-CreateRecipeOverridesTable.ts

apps/api/src/forms/recipe-overrides/
├── recipe-override.repository.ts
├── recipe-overrides.controller.ts
├── recipe-overrides.controller.spec.ts
├── recipe-overrides.module.ts
└── github-auth.guard.ts
```

### Files (modified)

- `apps/api/src/forms/form-definitions/form-definitions.service.ts`
- `apps/api/src/forms/forms.module.ts`
- `packages/database/src/index.ts`

### Verify

- Migration applies cleanly forward and back.
- `POST /admin/recipe-overrides` with `{ formId, disabled: true, reason: "..." }` → next `GET /form-definitions/{formId}` returns 410 within one request.
- `DELETE` re-enables; same `GET` returns 200.
- Without a valid GitHub admin token, the admin endpoints return 401.
- An override on `formA` does not affect `formB`.

---

## Out of scope (this branch)

(Mirrors the spec; restated for the implementer.)

- Migrating custom components to git.
- Staging-as-recipe-promotion-path.
- Builder UI for the emergency disable (admin endpoint only).
- Version-history browser / rollback UI in the builder.
- Removing the `published_at` column.

---

## Open questions

These are calls I made in the absence of a discussion turn — flag them with the user before or during the relevant phase if they disagree.

1. **Auth library on the builder: `iron-session`.** Mature, framework-agnostic, ships its own AEAD. Alternatives are `oslo/session` or hand-rolled. No existing convention in this repo for HTTP sessions. Reasonable to swap if the team has a preference.
2. **GitHub auth library: `@octokit/rest`.** Standard. Probably uncontroversial.
3. **PR target branch is `dev`** (per the issue). If repo convention has shifted toward PR-to-`main` directly, that's a one-line change in `github-publish.ts`.
4. **Admin endpoint lives on the API (per the spec)**, which means standing up a small new GitHub-OAuth-aware auth guard there. An alternative is to put the admin endpoint on the builder (which is already auth-aware after Phase 2) and have the API only read the override table. The spec picks the former; I'm following the spec, but the latter is materially less code. Decide before Phase 4 starts.
5. **Builder commit attribution: user-to-server token** (so `git blame` is the staff member) rather than App-bot + `Co-Authored-By`. Default in the spec. Trivially swappable.
6. **Whether `lint:recipes` should be in the same CI workflow as the existing typecheck/test, or a separate `recipes-validation.yml`.** I'd default to the existing one for simplicity; revisit if CI run-time becomes a problem.
7. **GitHub App vs separate OAuth App.** Modern GitHub Apps support user-to-server OAuth, so one App can do both. If the team would rather have an OAuth App and a GitHub App separately (e.g. for narrower scopes), that's a 30-minute config swap.

---

## After implementation

Each phase ends with a PR against `dev`. Once all four are merged and `dev → main` ships, this branch is done and the design becomes operating reality. Implementation is a separate session (typically `/bb:dev-start`).
