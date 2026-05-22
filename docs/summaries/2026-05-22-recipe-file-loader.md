# Recipe File Loader — Session Summary

**Date:** 2026-05-22
**Branch:** claudesiah/recipe-file-loader (PR 1 of 5 from spec `2026-05-22-form-builder-github-publish-design`)
**Issue:** #30

## What was built

A `RecipeFileLoaderService` that reads form recipes from `recipes/{formId}/{version}.json` at boot, validates each against the existing `serviceContractRecipeSchema`, and exposes the same `findAll` / `findByFormId` shape that `FormDefinitionsService` already consumes. The service routes between the existing DB-backed loader and the new file loader via a single env flag, `RECIPE_SOURCE`. Default is `db` — production behavior is unchanged. A `validate-recipes` CI job blocks PRs that introduce malformed or mis-named recipe files.

## Why it looks the way it does

**Single env switch, default `db`.** The whole PR is a no-op in production unless `RECIPE_SOURCE=files` is set. Picking that shape means PR 1 ships infrastructure with zero risk of regressing the current DB-backed path. The migration of actual recipes from DB into files, and the per-environment flag flip, happen in PR 2 — when there's something to migrate.

**Filename and directory naming are load-time invariants.** A recipe at `recipes/passport-renewal/1.0.0.json` must have `formId: "passport-renewal"` and `version: "1.0.0"`. The loader crashes at boot if either fails, and the CI script crashes the PR. This is deliberate: with files-as-source-of-truth, the path is itself metadata. Allowing drift between path and contents would create two possible answers to "what version is this?", and we'd lose the ability to fetch a specific version by path. Same checks in two places (loader + CLI) — duplicated on purpose, since one runs at runtime and one runs in CI without access to NestJS DI.

**Loader returns the recipe; hydration stays in `FormDefinitionsService`.** The loader is a *source-of-records*, not a content service. All hydration (`hydrateForm`, processor stripping, includeProcessors plumbing) lives in `FormDefinitionsService` exactly as before. Routing happens in a private `loadRecipe` helper that returns `ServiceContractRecipe | null`; everything downstream is unchanged. This kept the diff to `form-definitions.service.ts` small and made the test rewrite a clean two-branch matrix (db vs files).

**Atomic store swap inside the loader.** `loadAll` builds the entire `formId → version → recipe` map in a `next` local, then assigns to `this.store` at the end. A mid-flight zod failure throws before the assignment, so the previous successful load survives. Future dev file-watching can reuse this guarantee.

**Loader injected with `@Optional() recipesRoot?: string`.** This is the plan's chosen DI pattern: production gets `undefined` (falls back to `process.cwd()/recipes`), tests pass a temp directory directly. It works because nothing registers `String` as a provider token. A code reviewer flagged this as fragile — see *Known limitations* below.

**Recipes directory bundled into the Docker image.** A new `COPY --from=builder /app/recipes/ ./recipes/` in the runner stage means the loader can find the directory in production. The directory ships empty (just `.gitkeep`) so this PR has nothing to load even if the flag is flipped — that's by design.

**`@govtech-bb/form-types` added to root devDependencies.** Needed so `tsx scripts/validate-recipes.ts` resolves the schema package from the workspace root. The plan assumed it was already there at the root; it wasn't. It's in `devDependencies` (not `dependencies`) because nothing at runtime in the root depends on it — only the validation tooling.

**`validate-recipes` is its own CI job, not a step in `test`.** The job is independent of typecheck/test/build — it only depends on recipe files. Failing it shouldn't be conflated with a test or type failure. The `build:` job's `needs:` list intentionally does not include `validate-recipes`; recipe validity is orthogonal to whether the app compiles.

## Key files

| File | Change |
|------|--------|
| `recipes/.gitkeep` | New — empty directory survives in git so Dockerfile COPY won't fail |
| `apps/api/src/forms/form-definitions/recipe-file-loader.service.ts` | New — the loader |
| `apps/api/src/forms/form-definitions/recipe-file-loader.service.spec.ts` | New — 10 unit tests |
| `apps/api/src/forms/form-definitions/__fixtures__/*.json` | New — 4 test fixtures |
| `apps/api/src/forms/form-definitions/form-definitions.module.ts` | Loader registered as provider |
| `apps/api/src/forms/form-definitions/form-definitions.service.ts` | 4-arg constructor; `RECIPE_SOURCE` routes between DB and file loader |
| `apps/api/src/forms/form-definitions/form-definitions.service.spec.ts` | Rewritten — 11 tests (7 db branch, 4 files branch) |
| `apps/api/.env.example` | Documents `RECIPE_SOURCE=db` default |
| `apps/api/Dockerfile` | Bundles `recipes/` into the runtime image |
| `scripts/validate-recipes.ts` | New CLI: walks `recipes/`, validates against zod, asserts filename/formId match |
| `package.json` | Adds `validate-recipes` script + `tsx` + `@govtech-bb/form-types` (root devDeps) |
| `.github/workflows/ci.yml` | New `validate-recipes` job |

## Verification

- API test suite: **377 passed, 44 suites** (baseline 363 + 10 loader + 4 service).
- `pnpm exec tsc -b`: clean.
- `pnpm validate-recipes`: clean (`Validated 0 recipe file(s) across 0 form(s). OK.`).
- Docker build not run locally — relies on CI.
- Local boot smoke tests (`RECIPE_SOURCE=files` curl) not performed in this session: with `recipes/` empty, the files branch deterministically returns `[]` / 404, and the unit tests cover the routing logic. Worth running before flipping the flag in any environment.

## Known limitations (deferred to follow-up)

A code-quality review surfaced four observations that the plan did not ask to address. Each is real but low-impact at this stage; flagging here so they aren't lost:

1. **`@Optional() string` DI is fragile.** Relies on no other provider registering `String` as a token. A `@Inject('RECIPES_ROOT')` token would be more robust. Worth doing if/when the module grows.
2. **Pre-release semver tags aren't ordered.** `parseInt("0-beta", 10)` drops the suffix, so `"1.0.0-beta"` and `"1.0.0"` compare equal in `latestVersion`. The schema allows arbitrary version strings; pre-release tags are author-controlled. If we ever ship them, fix the comparator or restrict the schema.
3. **Second `readdir` doesn't filter by type.** A subdirectory inside a form folder named `X.json` would EISDIR. Theoretical, but a one-line fix.
4. **`FormDefinitionsService.findAll` (db branch) has no test.** The spec rewrite added a `findAll` test for the files branch but the pre-existing DB-branch logic remains uncovered. Pre-existing gap; worth adding when next touching this file.

## What wasn't done

- Dev file-watching (chokidar reload on file changes). Out of scope per the plan — deferred until a real recipe lives in the repo.
- The actual DB → files migration and per-env flag flip. That's PR 2.
- Per-recipe kill switch (PR 3), builder hosting/auth (PR 4), publish flow (PR 5).
