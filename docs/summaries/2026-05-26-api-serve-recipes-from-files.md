# API: serve published recipes from files — Implementation Session

**Date:** 2026-05-26
**Branch:** `feat/api-serve-recipes-from-files`
**Issue:** [#145](https://github.com/govtech-bb/gov-bb/issues/145) — apps/api leaks unpublished `form_definitions` drafts when `RECIPE_SOURCE=db`

## Context

`apps/api`'s recipe-resolution path had a `RECIPE_SOURCE` switch defaulting
to `db`, with `db` meaning "read the latest `form_definitions` row." That
table is builder scratch space (no `publishedAt` filter), so any environment
left on the default could surface unpublished drafts as live forms. A
parallel hole sat in `FormDraftsService.create()`: it bypassed
`FormDefinitionsService` and queried the table directly, so even flipping the
env var wouldn't have closed that path.

The plan (`docs/plans/api-serve-published-recipes-from-files.md`, revised
this morning) chose option (b) from the issue: make files the only runtime
source, gate `db` to development, and rewire drafts through
`FormDefinitionsService`. Recent merged PRs on `origin/sandbox` had already
landed the file loader, the dump script, and a colocated recipes path in the
Dockerfile — so the prereqs were in place.

## What we did

**Branched off `origin/sandbox` (91278c3), not `dev`.** Local `dev` is at
4c74985 — pre-recipe-loader, pre-dump-script, pre-colocated-Dockerfile. The
plan assumes the prereqs are in place. Confirmed with the user before
branching.

**Multi-agent worktree run.** Two `git worktree`s off the new branch, each
driven by a general-purpose subagent in parallel:

- `agent/api-recipes-impl` in `/tmp/gov-bb-wt/api` — all `apps/api` changes:
  `recipe-file-loader.service.ts` default root flipped to a
  `__dirname`-relative resolution; `form-definitions.service.ts`
  `RECIPE_SOURCE` default flipped to `files` and `db`-mode gated to
  `NODE_ENV=development` (with warning fallback); `loadRecipe` renamed to
  public `getRecipe`; `form-drafts.service.ts` injects
  `FormDefinitionsService` and uses `getRecipe`; `form-drafts.module.ts`
  imports `FormDefinitionsModule` and drops the now-orphan
  `FormDefinitionRepository`; Dockerfile drops the builder-stage
  `COPY recipes/` and points the runner-stage copy at
  `/app/apps/api/src/forms/form-definitions/recipes/ →
  ./dist/src/forms/form-definitions/recipes/`; `.env.example` rewritten to
  document the new default and the prod gate. Spec coverage added/updated
  in all three affected service specs. Four `fix(api): ...` commits.
- `agent/form-builder-publish-path` in `/tmp/gov-bb-wt/fb` — single change:
  `publish.ts` `contentsPath` now writes to
  `/contents/apps/api/src/forms/form-definitions/recipes/...`, with the
  publish spec's URL assertions updated to match. One commit.

**Merged both agent branches into `feat/api-serve-recipes-from-files`** via
`--no-ff` so the parallel-agent shape stays visible in the log. Cleaned up
`recipes/.gitkeep` (the repo-root `recipes/` directory now has no purpose).

**Post-merge fix to `github-recipes.ts`** after agent B flagged it. The
builder's read side (the GitHub Contents API client backing
`listPublishedForms` / `getPublishedRecipe` in `forms.ts`) was still pointed
at `/contents/recipes/...`. Without this fix the builder picker would lose
all published forms as soon as the first publish landed at the new path.
Factored the path into a `RECIPES_BASE` constant so the three GET sites and
their error messages stay in sync.

**Tests:** `nx test api` — 60 suites / 548 tests pass (1 suite / 2 tests
skipped pre-existing). `nx test form-builder-app` — 5 suites / 80 tests pass.
Type-checking implicit via ts-jest in both suites; lint-staged ran Prettier
on every commit.

## Why we did it that way

**`origin/sandbox` as the base, not `dev`.** Initially proposed branching
off `dev` per the user's instruction. A pre-flight check showed local `dev`
doesn't even contain `recipe-file-loader.service.ts` or
`dump-recipes-to-files.ts` — it predates the entire recipe-files initiative.
Branching off it would mean reimplementing changes that are already merged.
Surfaced this to the user before proceeding; they confirmed `sandbox` was
the right base. Eventual PR target should be `sandbox` too, not `dev`.

**Worktrees with `agent/*` branch names, not in-process edits.** Two
reasons: (1) the user asked for worktrees explicitly, (2) the work splits
cleanly between `apps/api` (heavy, ~9 files) and `apps/form_builder`
(1-line + spec). Splitting it lets the api work run uninterrupted while the
publish-path change happens in parallel. Both agents finished without
collision because their file sets were disjoint.

**Did not carry the colocated recipe file over.** The user had
`apps/api/src/forms/form-definitions/recipes/vehicle-colour-change-request/1.0.0.json`
staged on `claudesiah/dev` as prep work, but chose not to carry it onto the
new branch. The loader will boot with `Loaded 0 forms` until a recipe is
added via the publish flow or the dump script. The plan's manual
`GET /form-definitions/vehicle-colour-change-request` verify step needs that
file in place before it can pass — flagged at hand-off.

**`__dirname`-relative loader default, not `process.cwd()`.** The loader is
imported once at module-init time; using `__dirname` makes it work
identically in dev (resolves into the source tree) and in the runner
container (resolves into `/app/dist/src/forms/form-definitions/recipes/`,
where the Dockerfile copies the recipe JSON alongside the compiled JS). The
alternative — keeping `process.cwd()` and relying on the working directory
— would break the moment the container's `WORKDIR` changes or anything runs
the API from a different cwd.

**Prod gate logs a warning rather than throwing.** Throwing on
`RECIPE_SOURCE=db` outside dev would crash containers that inherit a stale
env var from a config layer no one remembers to clean up. The warn-and-fall-
back behavior keeps them serving correct content while making the
mis-configuration loud in the logs.

**`FormDraftsService` injects `FormDefinitionsService`, not the loader
directly.** That preserves the single decision point: every
recipe-resolution caller goes through the same `source()` gate. If we ever
add a third source (e.g. the local-dev publish-skip flow tracked in #153),
it lands in one place.

**`RECIPES_BASE` constant in `github-recipes.ts`.** Three GET sites in that
file + two URL assertions in the spec + several error-message templates all
referenced the path. Extracting the constant means the next time we move
the path (or ship a v2 alongside it), there's one line to change. Same
discipline the rest of the codebase uses for `REPO_OWNER`/`REPO_NAME`.

## Open items

- **No colocated recipe on the branch.** First operator to test
  `GET /form-definitions/vehicle-colour-change-request` will get a 404 until
  a recipe is added — either by re-running `pnpm exec dump-recipes` against
  a populated DB, by copying the staged file from `claudesiah/dev`, or by
  letting the first builder-driven publish PR land.
- **Smoke test deferred.** Unit tests cover the code paths; the docker-build
  and boot-and-curl verify steps from the plan are listed in `docs/form-recipes.md`
  for the operator to walk through.
- **Branch is not merged.** Tip is at `247fd64` on
  `feat/api-serve-recipes-from-files`. Three on-disk worktrees still exist
  under `/tmp/gov-bb-wt/` — clean up with `git worktree remove` after the PR
  merges. The user's `claudesiah/dev` was left untouched (still at
  `5e24133` with its original staged changes).
- **#153 follow-up still applies.** "Publish locally in dev (skip the PR
  loop)" — the dev escape hatch via `RECIPE_SOURCE=db` is the interim
  workaround.
