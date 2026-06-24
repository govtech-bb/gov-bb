# Single-source recipe override-merge (DUP-03, #1396)

## What

Recipe→ServiceContract hydration existed as two implementations: the production
serving path (`apps/api/src/registry/resolution.ts`, async resolver) and the
builder preview path (`packages/form-builder/src/resolution.ts`, sync catalog).
Inside each lived a byte-identical override-merge function
(`applyPrimitiveOverrides` / `applyOverrides`) that deep-merges `validations`
and `ui` while shallow-spreading the rest.

This change lifts that one function into `@govtech-bb/form-types` as
`applyFieldOverrides` and points both consumers at it. Net −78/+7 lines across
the consumers; the merge logic now exists exactly once.

## Why this shape

The duplication wasn't cosmetic — it regressed twice. A wholesale spread
dropped un-restated `validations` keys (#371) and `ui` keys (#789), and each
fix had to be applied to **both** copies. The risk being retired is "fix one,
forget the other → builder preview silently diverges from what citizens are
served."

**Why only the primitive-merge was extracted, not the whole hydrator.** The two
`resolution.ts` files are async (API) vs sync (builder) with different error
semantics — they cannot be naively merged. The genuinely-shared,
side-effect-free part is just the override-merge. The async/sync resolver
shells and the block-iteration shells stay where they are; each calls the one
shared core.

**Why `@govtech-bb/form-types`, not a new `@govtech-bb/form-hydration`
package.** Both consumers already depend on form-types (it already owns
`shallowMergeDefined`, which the merge uses), so this needed zero new nx
project / tsconfig-reference wiring. A new package was the plan's fallback and
wasn't necessary.

**Why the error types were left unreconciled.** `UnresolvableComponentError`
(API: throws on the first unresolved ref, async, per-ref) and `UnknownRefError`
(builder: collects all misses in one pass, sync, throws once) are not just
divergent names — they have different runtime behaviour. Collapsing them would
change semantics and is outside the duplication-removal goal, so both were left
intact.

**Why no dedicated cross-path "byte-identical" test.** The plan floated a test
asserting both hydrators produce identical output. It would require giving
`apps/api` a dependency on `@govtech-bb/form-builder` (which the plan
explicitly rejected), and it is now redundant: both paths call the same
exported function, and each consumer already retains its own #371/#789
hydration-level regression test (`registry.service.spec.ts`,
`resolution.spec.ts`). The new `resolution-merge.spec.ts` pins the shared
function directly, including the #371/#789 shapes and the omit-when-absent
branches.

## Verification

- `pnpm exec nx run-many -t build --exclude=landing,cms` — 13 projects built
- `pnpm exec nx run-many -t test -p api,form-builder,form-types` — 869 passed
- `pnpm exec tsc -b` — exit 0

`api:lint` is red, but only on pre-existing `no-explicit-any` debt in unrelated
files (email/sqs processors, `main.ts`); the touched `resolution.ts` is clean.
