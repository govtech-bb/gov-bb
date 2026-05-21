# Improved Form Builder Deployment — Hybrid (Git + DB) Design

**Date:** 2026-05-21
**Branch:** `service/improved-formbuilder-deployment`
**Issue:** [govtech-bb/gov-bb#30](https://github.com/govtech-bb/gov-bb/issues/30)
**Related:** [#11](https://github.com/govtech-bb/gov-bb/issues/11) (removing unauthenticated write endpoints)
**Source analysis:** [Recipe Storage: Cost-Benefit Analysis](https://teamgovtechworkspace.slack.com/files/U0AUXMTSJGG/F0B5ZC2BFC0/recipe-storage-analysis.md)

---

## Context

Form recipes (`ServiceContractRecipe` JSON blobs) currently live in the PostgreSQL `form_definitions` table. The form builder writes them directly via TypeORM; the API serves them via `GET /form-definitions/:formId`. Two problems force a change:

1. The builder has no auth — we cannot safely deploy it as-is or hand prod DB credentials to authors' laptops.
2. There is no review or audit gate between "staff hits Save" and "broken form ships to citizens" — unacceptable for citizen-facing government forms.

The cost-benefit analysis (Option A / B / C) recommends the **Hybrid** approach: git is the production source of truth for recipes; the DB is a scratchpad for drafts; "Publish" opens a PR.

## Goal

Adopt the Hybrid model: production recipes live as git-tracked JSON files; drafts stay in the DB; publishing happens via PR opened by the builder. Builder gains GitHub OAuth. API removes unauthenticated write endpoints. An emergency-disable mechanism lets staff yank a broken form fast without a deploy.

## Decisions

**D1. Production recipes live in `recipes/{formId}/{version}.json`, committed to the repo.** API loads them from disk at boot.

**D2. The DB `form_definitions` table is repurposed as the recipe draft store.** `published_at IS NULL` rows are drafts. After this design lands, no row will ever be marked "published" again — publishing means a merged PR, not a column update.

**D3. The builder's "Publish" button opens a PR against the repo via a GitHub App,** committing the recipe to `recipes/{formId}/{version}.json` on a branch cut from `dev`. Authors review and merge through normal GitHub flow.

**D4. The builder authenticates users via GitHub OAuth.** RBAC = membership in a configured GitHub team in the `govtech-bb` org. No custom RBAC schema.

**D5. The public API exposes only read endpoints for form definitions.** All recipe writes happen via PR. (Closes the loop on #11.) The override admin endpoint introduced in Phase 4 is *not* a recipe write — it toggles a runtime kill-switch — and is itself auth-gated.

**D6. An emergency-disable mechanism overrides file-loaded recipes.** A small `recipe_overrides` DB table can flag a recipe as disabled; the API returns a maintenance response without needing a deploy.

**D7. Custom components stay DB-backed for now.** Moving them to git is a follow-up.

**D8. `main` is prod. No staging-as-recipe-promotion-path in this branch.** A dedicated staging gate is a follow-up; this design works without it.

## Architecture

### Components introduced

| Component | Location | Role |
| --- | --- | --- |
| `RecipeFileLoader` | `apps/api/src/forms/recipe-file-loader/` | At boot, scans `recipes/**` and builds an in-memory map `{formId → latestRecipe, versions[]}`. New recipes go live with the next deploy. File-watch (hot reload) is enabled in dev only. |
| `RecipeOverrideRepository` | `apps/api/src/forms/recipe-overrides/` | Reads/writes `recipe_overrides` table; checked on every form-definition read. |
| `GithubPublishService` | `apps/form_builder/app/server/github-publish.ts` | Wraps the GitHub App: creates branch, commits recipe file, opens PR. |
| `AuthRoutes` | `apps/form_builder/app/routes/auth/*` | `/auth/login`, `/auth/callback`, `/auth/logout`. Stores session in signed cookie. |
| `recipes/` | repo root | Storage for committed recipe files. |
| Migration script | `scripts/export-recipes-to-files.ts` | One-shot: dump current published rows to files, commit them. |

### Components changed

| Component | Change |
| --- | --- |
| `FormDefinitionsService` (API) | Reads from `RecipeFileLoader`; falls back to DB only if no file is found for a `formId` (transitional grace, removed after migration). Checks `RecipeOverrideRepository`. |
| `FormDefinitionsController` (API) | Stays read-only. Existing throttling preserved. |
| `apps/form_builder/app/server/forms.ts` | `submitRecipe` / `updateRecipe` keep writing to DB (drafts). New `publishRecipe` server function calls `GithubPublishService`. |
| Builder UI — toolbar / submit modal | New "Publish via GitHub" action: pre-publish validation, PR description input, opens GitHub PR in a new tab on success. |

### Components removed

- Any public unauthenticated write paths on `/form-definitions/*` (POST/PUT/PATCH/DELETE). Confirm via audit of `forms.module.ts` and route exports. Tracked under #11.

## Data flow

### Read path (production)

```
client (apps/web) ──GET /form-definitions/:formId──▶ FormDefinitionsController
                                                       │
                                                       ▼
                                          FormDefinitionsService.findByFormId
                                                       │
                              ┌────────────────────────┼──────────────────────┐
                              ▼                        ▼                      ▼
                  RecipeOverrideRepo            RecipeFileLoader        RegistryService
                  (disabled? → 410)          (returns latest recipe)    (hydrate components)
```

The DB `form_definitions` table is no longer queried for production reads after the file migration completes.

### Draft save (builder)

```
builder UI ──submitRecipe / updateRecipe──▶ form_builder server fn ──▶ form_definitions table
                                                                              │
                                                                              ▼
                                                              published_at = NULL (always)
```

Unchanged from today except `submitRecipe` never sets `published_at` and `updateRecipe` no longer needs the "published" guard (publishing isn't a column flip anymore).

### Publish (new)

```
builder UI ──publishRecipe──▶ form_builder server fn
                                  │
                                  ├─ 1. validateFormContract(recipe)  (existing utility)
                                  ├─ 2. Confirm user has publish permission (GitHub team check, cached)
                                  ├─ 3. GithubPublishService.openPr({ formId, version, recipe, prDescription, actor })
                                  │      │
                                  │      ├─ POST /repos/govtech-bb/gov-bb/git/refs  (branch from dev)
                                  │      ├─ PUT  /repos/.../contents/recipes/{formId}/{version}.json
                                  │      └─ POST /repos/.../pulls
                                  │
                                  └─ 4. Return PR URL to client
```

The branch name follows `formbuilder/publish-{formId}-{version}-{shortHash}` to avoid collisions when two authors publish near-simultaneously.

### Emergency disable

```
oncall / staff ──POST /admin/recipe-overrides──▶ AdminController (gated by GitHub admin team)
                                                    │
                                                    ▼
                                          recipe_overrides table
                                                    │
                                                    ▼
                              next form-definition read returns 410 + maintenance message
```

Admin endpoint lives in the API behind the same OAuth/team check as the builder publish action. Not user-facing; small surface; no UI needed in this branch.

## Schemas

### `recipes/{formId}/{version}.json`

The on-disk format is exactly the existing `ServiceContractRecipe` JSON written by `serializeRecipeDraft`. No schema change — file content matches today's `form_definitions.schema` column. The filename encodes identity (`formId`, `version`); they are also redundantly present inside the JSON.

Files are written in canonical form: pretty-printed with 2-space indent, sorted object keys, trailing newline. This keeps PR diffs reviewable and produces stable git history. The migration script, the publish flow, and any manual edits must produce the same canonical form (enforced by a CI lint step in Phase 1).

### `recipe_overrides` (new table)

```
form_id        varchar(100) PRIMARY KEY
disabled       boolean      NOT NULL DEFAULT false
disable_reason text         NULL
actor          varchar(255) NULL   -- GitHub login of who flipped it
created_at     timestamp    NOT NULL
updated_at     timestamp    NOT NULL
```

One row per disabled form. Deleted (or `disabled = false`) when service is restored.

### Sessions (builder)

Signed cookie holding `{ githubLogin, accessToken (encrypted), teamMemberships, expiresAt }`. Short TTL (e.g. 8h), re-checked against GitHub on every publish action.

## Error handling

| Failure | Behaviour |
| --- | --- |
| File loader can't parse a recipe at boot | Log error, skip that recipe, keep serving the rest. API process does NOT crash. Bad file is treated as "not found" for that `formId`. |
| GitHub App API call fails (rate limit, network, auth) | Surface error to builder UI with retry guidance. Draft is unaffected (still in DB). No partial state — branch creation, file commit, and PR open are best-effort sequential; on failure mid-way, the open branch is left for human cleanup (logged + linked from UI). |
| User session lacks publish permission | "Publish" button disabled in UI; server-side rejects with 403. |
| Two authors publish the same `{formId, version}` | Second PR open succeeds but the file path collision is caught at merge time. Reviewer resolves. Spec accepts this — versions are author-controlled and conflicts are visible. |
| `recipe_overrides` flags a form | API returns 410 Gone with maintenance message. `apps/web` displays it instead of the form. |
| File loader misses a `formId` that exists in DB (transitional) | Service falls back to DB for that one read. Logs a warning to drive the migration to completion. Fallback removed at end of Phase 1. |

## Testing

- **Unit:** `RecipeFileLoader` parses a directory of fixtures correctly, skips bad files, picks the highest version. `RecipeOverrideRepository` round-trips. Migration script produces files byte-equivalent to source JSONB.
- **Unit:** `GithubPublishService` against a mocked Octokit — happy path, 4xx/5xx errors, rate limit, branch-already-exists.
- **Integration (API):** boot with a recipes fixture directory; `GET /form-definitions/:formId` returns the expected hydrated contract. Flip a `recipe_overrides` row; same request returns 410.
- **Integration (builder):** OAuth login round-trip against a stubbed GitHub. Draft save → publish → mock GitHub call → PR URL returned. Permission denial returns 403.
- **E2E (manual checklist):** export migration on a dev DB, file appears under `recipes/`, API serves it, `apps/web` renders it, disable override hides it, re-enable shows it again.

## Phasing

Four phases. Each is independently committable; each ends with a working app. PRs target `dev`.

### Phase 1 — File loader + migration

**Goal:** API can serve recipes from files. Existing recipes are exported.

- Add `apps/api/src/forms/recipe-file-loader/` (loader, tests, module).
- Wire `FormDefinitionsService` to read from loader first, DB fallback for un-migrated `formId`s.
- Add `scripts/export-recipes-to-files.ts` — exports current published rows to `recipes/{formId}/{version}.json`.
- Run migration in a separate commit; review the resulting `recipes/` tree.
- After migration completes, remove the DB fallback in a follow-up commit on the same phase.

**Verify:** `GET /form-definitions/:formId` returns the same contract as before the change. `apps/web` renders all forms unchanged. No DB read on the production read path.

### Phase 2 — Builder GitHub OAuth + Publish-via-PR

**Goal:** Authors can log in and publish recipes through a PR.

- GitHub App configured (one-time, manual): `contents:write`, `pull_requests:write` on `govtech-bb/gov-bb`.
- Builder routes: `/auth/login`, `/auth/callback`, `/auth/logout`. Session cookie.
- Server-side middleware: every server function requires a valid session; publish requires team membership.
- `GithubPublishService` and `publishRecipe` server function.
- UI: replace the existing submit modal with a publish flow (pre-publish validation + PR description + opens PR URL on success).

**Verify:** Login round-trip. Save draft → publish → PR appears in repo with the expected file contents.

### Phase 3 — Remove unauthenticated write endpoints

**Goal:** Close #11. The public API has only read endpoints for form definitions.

- Audit `forms.module.ts` and remove any public write routes on `/form-definitions/*`.
- Remove `submitRecipe`/`updateRecipe`-equivalent paths on the API (the builder's own server functions remain).
- Add tests that assert these routes return 404/405.

**Verify:** Direct HTTP request to the removed routes is rejected. Existing read flows are unaffected.

### Phase 4 — Emergency disable

**Goal:** Staff can disable a broken form in seconds.

- `recipe_overrides` table + repository.
- `FormDefinitionsService` checks overrides on read.
- Small admin endpoint (`POST /admin/recipe-overrides`, `DELETE /admin/recipe-overrides/:formId`) gated by GitHub admin-team check. No UI in this branch — CLI / API tool is acceptable.

**Verify:** Flipping an override returns 410 for that form within one request. Removing it restores normal serving.

## Out of scope (this branch)

- Migrating custom components to git (separate effort).
- Staging-as-recipe-promotion-path (`staging` branch → staging API deploy gating).
- Builder UI for emergency disable (admin endpoint only; UI later if needed).
- Version-history browser / rollback UI in the builder (rollback is `git revert` on the PR).
- Removing the `published_at` column. It is harmless after this change; cleaning it up is later refactor work.

## Open questions

- **PR target branch:** Issue mentions `dev`. Confirm during Phase 2 implementation; trivially configurable. Default: `dev`.
- **OAuth attribution vs App attribution:** Publishing via the App with `Co-Authored-By` on the user, or swapping the OAuth token for a user-to-server token so the commit author is the user directly? Both are valid; pick during Phase 2 once GitHub App is configured. Default: user-to-server token, so `git blame` matches the staff member.
- **Bootstrapping a brand-new form via the builder:** With recipes in git, a never-published form has no file on disk. The builder lists drafts from the DB and resolves the "what version comes next" logic against the latest of (DB drafts ∪ on-disk files). Confirmed workable; detail handled in Phase 2 implementation.

## Verification plan (end-to-end)

1. Author opens the builder, edits a recipe, hits Save → draft persists (DB row, `published_at` always null).
2. Author hits Publish → PR appears in `govtech-bb/gov-bb` with the recipe under `recipes/{formId}/{version}.json`, authored as the staff member.
3. Reviewer approves and merges to `dev`. Standard PR flow.
4. `dev` deploy completes — `GET /form-definitions/:formId` returns the new recipe from disk.
5. `apps/web` renders the form correctly with hydrated components.
6. Roll back: `git revert` the PR, merge to `dev`, redeploy. Runtime returns to the previous recipe.
7. Emergency disable: flip a `recipe_overrides` row → form returns 410 within one request. Remove the row → form serves normally again.
