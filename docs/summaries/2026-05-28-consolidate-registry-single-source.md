# Consolidate component registry — single source of truth

## Context

`apps/api/src/registry/builtins/` was a hand-synced duplicate of
`packages/registry/src/` (held together by a "keep in sync" comment and a
length-typed guard). [#369](https://github.com/govtech-bb/gov-bb/issues/369)
asked to retire the api copy and make `@govtech-bb/registry` the single source
of truth. Executed from the plan in
`docs/plans/consolidate-registry-single-source.md`.

## What we did

- Added `RegistryEntry` and a combined `BUILTIN_REGISTRY` export to
  `packages/registry/src/index.ts`; reframed the count guards; dropped the
  cross-tree sync comments.
- Wired `@govtech-bb/registry` into `apps/api` (`package.json` dep +
  `tsconfig.json` reference), repointed three imports
  (`registry.service.ts`, `resolution.ts`, `registry.service.spec.ts`) from
  `./builtins` to the package, and deleted `apps/api/src/registry/builtins/`
  (57 files, incl. the dead `behaviors/`).
- Recorded [ADR 0018](../decisions/0018-registry-is-sole-home-for-builtin-definitions.md)
  and added a "superseded in part" note to ADR 0008.

## Why we did it that way

- **Centralized the merged map in the package, not the api.** The plan's
  rejected alternative was to keep `BUILTIN_REGISTRY`/`RegistryEntry` in the
  api and have the package export only the two split maps. We put both in the
  package so the api spec change is a one-line import swap and no resolver
  concept is left stranded once `builtins/index.ts` is gone.
- **Confirmed it was a re-point, not a content migration.** The two trees were
  content-identical (Prettier diffs only) and `BUILTIN_REGISTRY` had exactly
  one runtime consumer (`RegistryService`) plus its spec — verified before
  touching anything, which is what made the delete safe.
- **Verified the boot path the test suite doesn't cover.** A bad recipe ref
  crashes the api at `onModuleInit`, and build/test never boot the api. So
  beyond build/test/`tsc -b`, we ran a resolve-over-recipes check: all 35
  builtin (2-segment) refs across `recipes/` resolve against the consolidated
  `BUILTIN_REGISTRY`; the 16 `components/generic/*` refs are DB-resolved
  custom components and correctly absent.

## What we almost got wrong

The first `pnpm install` in the worktree rewrote ~186 lines of
`pnpm-lock.yaml` — re-resolving `@types/node` 24.12.4 → 22.19.19 across peer-dep
hashes, unrelated environment drift that would have ridden along in the commit.
Caught it by reading the diff (additions *and* removals), reverted the lockfile,
and hand-added only the 3-line `@govtech-bb/registry` link edge. `pnpm install
--frozen-lockfile` then validated clean, confirming that edge is the complete
and correct lockfile change.

## Open questions

None. The save-boundary ref validation gap noted in ADR 0008 remains tracked
separately and is out of scope here.
