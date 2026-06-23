# Form Recipes — How They Ship and How the API Serves Them

**Status:** Active
**Owners:** `apps/api` (runtime serving), `apps/form_builder` (publish flow),
`packages/database/scripts` (dev sync)
**Related:**
[Issue #145](https://github.com/govtech-bb/gov-bb/issues/145),
[Issue #1196](https://github.com/govtech-bb/gov-bb/issues/1196) (versioning removed),
[Decision 0007](decisions/0007-runtime-recipes-load-from-files-not-form_definitions-table.md),
[Decision 0057](decisions/0057-recipe-versioning-removed-one-flat-file-per-form.md)

> **Recipe versioning was removed (#1196).** Each form is now a single mutable
> file `recipes/{formId}.json`; publishing overwrites it and the PR diff *is* the
> record of change (git is the version history). Legacy versioned
> `recipes/{formId}/{version}.json` directories are retained read-only as a
> runtime fallback for in-flight pinned submissions/drafts until the Phase 2
> decommission; they are frozen and never the served artifact.

---

## TL;DR

- Recipes ship as JSON files committed to the repo at
  `apps/api/src/forms/form-definitions/recipes/{formId}.json` (one flat file per
  form).
- The API serves them from disk. No DB. The `form_definitions` table is
  builder scratch space — not a runtime source.
- Authors publish via `apps/form_builder` → it opens a PR that adds the
  recipe file → review → merge → restart the API → the recipe is live.
- The `RECIPE_SOURCE` env var defaults to `files`. `db` is a
  dev-only escape hatch (`NODE_ENV=development` required) for previewing
  builder drafts without going through the publish PR.

---

## Where recipes live

```
apps/api/src/forms/form-definitions/recipes/
  ├── vehicle-colour-change-request.json   ← canonical (served)
  ├── passport-renewal.json                ← canonical (served)
  ├── vehicle-colour-change-request/       ← legacy fallback (frozen, read-only)
  │   ├── 1.0.0.json
  │   └── 1.1.0.json
  └── …
```

- One flat file per `formId`, named `{formId}.json`. The filename must match
  `recipe.formId` (`validate-recipes` checks this). The file carries no
  `version` field.
- The recipe JSON conforms to `serviceContractRecipeSchema` from
  `@govtech-bb/form-types` (where `version` is now optional).
- `findAll()` returns one entry per `formId` from the flat file; `findByFormId({
  formId })` resolves the flat file. `findByFormId({ formId, version })` is the
  legacy fallback path — it resolves a frozen `{formId}/{version}.json` for an
  in-flight submission/draft that still pins a version.

In the runner container these files end up at
`/app/dist/src/forms/form-definitions/recipes/`, copied by the Dockerfile
alongside the compiled API. (The pattern mirrors how `apps/api/src/email/templates/`
`.hbs` files are copied — tsc doesn't bundle non-`.ts` assets.)

---

## Lifecycle: from author to runtime

1. **Author edits in `apps/form_builder`.** Draft state lives in the
   `form_definitions` table — this is intentional scratch space, and is
   *not* served to end users at any point.
2. **Author clicks Publish.** `apps/form_builder/app/server/publish.ts`:
   1. Reads the base-branch tip SHA via the GitHub API.
   2. Creates a namespaced branch `form-builder/{formId}-{ts}`.
   3. Overwrites the flat recipe JSON at
      `apps/api/src/forms/form-definitions/recipes/{formId}.json` via the GitHub
      Contents API (fetch the existing SHA, then update in place).
   4. Opens a PR against the base branch with the form's metadata in the body.
      The PR diff shows only the fields that changed.
3. **Reviewer approves and merges the PR.** The recipe file is now on the
   integration branch.
4. **API picks it up on next boot.** `RecipeFileLoaderService.onModuleInit`
   walks the recipes tree, loading each flat `{formId}.json` as the canonical
   recipe and each `{formId}/{version}.json` into the legacy fallback map.
   **There is no hot reload** — file changes require a server restart to take
   effect.
5. **End-user requests `GET /form-definitions` or
   `GET /form-definitions/{formId}`** and the API returns the hydrated
   contract from that in-memory map.

The same on-disk path is referenced by **five places** — keep them in sync if
you ever move it:

| Where | What |
|---|---|
| `apps/api/src/forms/form-definitions/recipe-file-loader.service.ts` | API loader (`DEFAULT_RECIPES_ROOT`) |
| `apps/api/Dockerfile` | Runner-stage `COPY` |
| `apps/form_builder/app/server/publish.ts` | `contentsPath` (write side) |
| `apps/form_builder/app/server/github-recipes.ts` | `RECIPES_BASE` (read side) |
| `packages/database/scripts/dump-recipes-to-files.ts` | Dump destination |

---

## Environment configuration

### `RECIPE_SOURCE`

| Value | Behavior |
|---|---|
| `files` *(default)* | Serve from disk via `RecipeFileLoaderService`. |
| `db` (only with `NODE_ENV=development`) | Serve from `form_definitions` rows. Lets builder drafts surface without going through the publish PR. |
| `db` (with `NODE_ENV` not `development`) | **Ignored.** A warning is logged and the API falls back to `files`. |

The prod gate lives in `FormDefinitionsService.source()`. End-user callers
don't need to remember it — they call `getRecipe()` and the right source is
chosen for them.

### `NODE_ENV`

Treated normally for everything else. The only recipe-specific behavior is
gating `RECIPE_SOURCE=db` (see above). `NODE_ENV=test` runs the `files`
loader by default; specs that need `db` semantics opt in by mocking
`ConfigService` to return both `RECIPE_SOURCE=db` and
`NODE_ENV=development`.

---

## Local development

### You're iterating on a recipe you already have committed

Nothing special. `pnpm dev:api` boots with `RECIPE_SOURCE=files`, loads
everything under `apps/api/src/forms/form-definitions/recipes/`. Edit the
JSON, restart the API.

### You're iterating on a recipe inside the builder UI

Two options:

**Option A — dev escape hatch (fastest):**

```bash
# apps/api/.env or your shell
NODE_ENV=development
RECIPE_SOURCE=db
```

With both set, the API reads from `form_definitions`, so anything you save
in the builder shows up immediately on the next request. Restart the API
once after changing the env vars; after that, builder saves are picked up
without restart (each request re-queries the table).

**Option B — round-trip the publish PR (slower, more realistic):**

Use the builder's Publish button. The PR opens against `dev`. Merge locally
or check out the branch, restart the API, recipe is live.

Issue #153 tracks a "publish locally" flow that would skip the PR loop
without needing `RECIPE_SOURCE=db`. Until that ships, option A is the
intended dev shortcut.

### You want to seed your local recipes/ tree from a DB you already have

```bash
pnpm tsx packages/database/scripts/dump-recipes-to-files.ts
```

Writes every published recipe row to
`apps/api/src/forms/form-definitions/recipes/{formId}/{version}.json`. Useful
for bootstrapping a working tree from a DB snapshot.

---

## Production behavior

- API boots with `RECIPE_SOURCE` unset (or explicitly `files`). Loader logs
  `Loaded N forms (M recipe files) from /app/dist/src/forms/form-definitions/recipes`.
- If anyone sets `RECIPE_SOURCE=db` in production, the API logs:
  ```
  RECIPE_SOURCE=db is only honored when NODE_ENV=development (got NODE_ENV=production); falling back to "files".
  ```
  …and continues serving from files. The mis-configuration is loud but not
  fatal.
- `form_definitions` table contents are unreachable from any end-user
  controller. They remain reachable from the builder's own `/builder/*`
  endpoints and from `DraftArchiveService` (admin path).
- Recipe file changes require a container restart. Rolling deploy is the
  expected pattern.

---

## Verification (smoke tests)

After deploying — or after first build of the runner image — walk through:

1. **Build the runner image.**
   ```bash
   docker build -f apps/api/Dockerfile .
   ```
2. **Boot the container with defaults.** Expect a log line like:
   ```
   Loaded N forms (M recipe files) from /app/dist/src/forms/form-definitions/recipes
   ```
   `N=0` is valid if nothing has been published yet — it means the loader is
   working but the tree is empty.
3. **Hit the list endpoint.**
   ```bash
   curl http://localhost:3001/form-definitions
   ```
   Returns one entry per `formId` present on disk.
4. **Hit a specific form.**
   ```bash
   curl http://localhost:3001/form-definitions/vehicle-colour-change-request
   ```
   Returns the hydrated `ServiceContract`. `404` means the JSON file isn't
   present — check
   `/app/dist/src/forms/form-definitions/recipes/vehicle-colour-change-request/`
   inside the container.
5. **Confirm the prod gate.** Boot with
   `RECIPE_SOURCE=db NODE_ENV=production`. Expect the warning log line above;
   responses still match step 4.
6. **Confirm the dev escape hatch.** Locally, set `RECIPE_SOURCE=db` and
   `NODE_ENV=development`. Save a draft in the builder; it should appear in
   `GET /form-definitions/{your-form-id}` without going through a PR.

---

## Common operations

### Publish a form (new or existing)

Use the builder's Publish button. It handles branch creation, file write,
and PR open. Publishing an existing form **overwrites** its flat
`{formId}.json` in place — there is no version to bump. After merge: restart
the API.

### Retire a form

Remove the flat `apps/api/src/forms/form-definitions/recipes/{formId}.json`
in a PR. After merge and restart, the loader won't surface it.

### Edit a recipe directly

Editing the flat file by hand (via PR) is fine — the file *is* the canonical
recipe and the PR diff is the audit trail. Restart the API on merge.

### Recover from a malformed recipe at boot

The loader is strict: a recipe that fails schema validation throws at
startup with `Recipe {path}: ... failed validation: ...` — the API will not
boot. Fix the JSON or revert the bad commit.

### Force a recipe path mismatch error

`validate-recipes` checks that `recipe.formId` matches the flat filename. A
mismatch fails the CI gate. Treat it as a build-time issue; it should never
reach production.

---

## Migration notes

If you're upgrading a deployment from the old `RECIPE_SOURCE=db` default:

1. Ensure every recipe you serve has a committed JSON file. Run
   `pnpm tsx packages/database/scripts/dump-recipes-to-files.ts` against a
   snapshot of the production DB and commit the result.
2. Drop the `RECIPE_SOURCE` env var (or set it to `files` for clarity).
3. Audit any reads of `FormDefinitionRepository` from end-user controllers
   — they should now route through `FormDefinitionsService.getRecipe()`. The
   drafts service in `apps/api/src/forms/form-drafts/form-drafts.service.ts`
   is the canonical pattern.
4. Restart and run the verification steps above.

If you discover a runtime read of `form_definitions` from an end-user code
path that *isn't* going through `FormDefinitionsService.getRecipe()`, that's
a regression of issue #145 — treat it as a blocker.
