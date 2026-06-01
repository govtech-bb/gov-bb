# 0023 — Repo-recipe integrity guards must be always-run, not affected-gated

**Date:** 2026-06-01
**Status:** Accepted
**Related:** [#504](https://github.com/govtech-bb/gov-bb/issues/504), [#349](https://github.com/govtech-bb/gov-bb/issues/349). Extends [0017](0017-recipe-ref-resolution-fails-loud.md) (recipe ref resolution fails loud) with the CI-enforcement half.

## Context

Recipe JSON files live committed in the repo
(`apps/api/src/forms/form-definitions/recipes/<formId>/<version>.json`) and are
served to the production renderer at request time. Ref resolution is lazy
(`RegistryService.hydrateForm`), so an unresolvable ref in a committed recipe is
**not** caught at boot, by the build, or by type-checking — only by an explicit
guard. 0017 made the *runtime* resolvers fail loud; this record is about *where
that guard runs in CI*.

The original guard, `recipe-registry-refs.spec.ts`, ran under `nx affected -t
test`. nx-affected scoping runs a project's tests only when that project (or a
dependency) is in the change set. A recipe added under a PR that nx classified
as not affecting `api` therefore **skipped the guard entirely**. That is exactly
what happened on #349: pre-migration slash refs
(`components/generic/text`, …) landed on `sandbox` unguarded, then broke CI on
every *other* open PR that merged the poisoned `sandbox` (#495, #504).

Affected-gating is the right default for unit tests (speed), but it is wrong for
a guard whose entire job is to protect a shared, committed artifact against *any*
change — including changes that don't touch the guarded project.

## Decision

Integrity guards over committed recipe files — ref resolution against
`BUILTIN_REGISTRY`, the `MIGRATED_SLASH_REFS` / `ORPHAN_SLASH_REFS` bans, and the
schema / filename-version / formId-directory consistency checks — are enforced by
the **always-run** `pnpm validate-recipes` CI job (`scripts/validate-recipes.ts`),
not by an `nx affected`-gated test.

The script is the single source of truth for repo-recipe integrity. Its pure
checks live in `scripts/recipe-ref-guards.ts` (free of workspace imports so they
unit-test in isolation), and the script reads the real recipes root resolved from
its own file location — never `process.cwd()/recipes`, which silently resolved to
nothing and made the guard a no-op for years.

## Consequences

- **New repo-recipe guards go in `validate-recipes`, not a spec.** Any future
  check that protects committed recipe files (a new ref form, a deprecated
  primitive, a contact-details rule) belongs in the always-run script or its
  `recipe-ref-guards` helpers — not in an affected-gated unit test that a
  recipe-only PR could skip.
- **The script must stay DB-free.** CI has no database, so the script resolves
  against the static `BUILTIN_REGISTRY` only and falls back to the known-bad
  ban-lists for slash/orphan refs. Custom-component refs
  (`components/<ns>/<type>`) it cannot confirm are presumed valid and skipped —
  the same limitation the deleted spec lived with. Full-catalog resolution
  (builtins + registry + live custom) remains the job of the server-side
  `/builder/registry/validate` endpoint (0017), which *does* have DB access.
- **Silent no-ops are failures.** A guard that finds nothing because it's looking
  in the wrong place is worse than no guard — it reads as green. The script now
  errors (exit 1) if the recipes directory is missing, rather than printing
  "nothing to validate" and exiting 0.
- **`@govtech-bb/registry` is a root workspace dependency.** The root-level `tsx`
  script imports `BUILTIN_REGISTRY`, so the package is declared in the root
  `package.json` (alongside `@govtech-bb/form-types`), not only in the apps that
  consume it.
