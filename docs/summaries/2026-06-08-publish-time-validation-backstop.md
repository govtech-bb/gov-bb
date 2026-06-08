# Publish-time validation backstop (#759)

## Context

[#759](https://github.com/govtech-bb/gov-bb/issues/759) flagged that the
form_builder_api **write** endpoints persist recipes without running
`validateFormContract`, and proposed adding the contract check to
`createForm`/`updateForm`/`rekeyForm`. Discussion (captured in the plan)
established that was the wrong fix: saving a contract-invalid draft is a
deliberate feature, DB drafts never serve production (`RECIPE_SOURCE=files`),
and CI's `validate-recipes` already gates the merge.

The one real residual gap was **fail-fast at publish**: `POST /builder/publish`
wrote the recipe to GitHub and opened a PR with no server-side validation,
trusting the client Deploy gate. A direct API call, a stale tab, or a buggy
client could bypass that gate and open a junk PR that only exists to fail CI.
Closing that gap — a server backstop behind the client gate — was the in-scope
work. Resolved on `publish-time-validation-backstop-759` (targets `sandbox`).

## What we did

- **Added `apps/form_builder_api/src/routes/validate-recipe.ts`** — a shared
  `validateRecipeFully(recipe)` helper running the three validation layers that
  were inlined in `validateHandler`: `validateFormContract` (schema + kebab ids
  + #771 repeatable bounds) → `findRecipeIdCollisionsFromRecipe` /
  `formatCollisionIssues` → `collectUnknownRefs`. Returns the same
  `{ ok: true, data } | { ok: false, issues }` shape `/validate` already emits.
- **Refactored `registry.ts`** — `validateHandler` now just
  `await validateRecipeFully(...)` and returns it. Pure extraction, no
  behaviour change; `registry.validate.spec.ts` stays green and pins that.
- **Edited `publish.ts`** — extracted the inline router callback into an
  exported `publishHandler`, which calls `validateRecipeFully` right after the
  recipe/token presence check and returns `400 { error, issues }` **before any
  GitHub `fetch`** on failure.
- **Added `publish.spec.ts`** — invalid recipe (snake_case id) → 400 + issues +
  zero fetches; unknown ref → same; valid recipe → proceeds to the GitHub flow
  (`prUrl`/`prNumber`); missing recipe/token → 400 before validating.
- **ADR 0042** records the principle: contract validation gates at publish, not
  at draft writes.

## Why we did it that way

- **Backstop at publish, not the write endpoints.** The write paths persist
  drafts and must keep accepting invalid ones; the publish boundary is where a
  recipe is about to become a production PR, so that is the correct place for a
  hard gate. See ADR 0042 for the full reasoning the issue's proposed fix would
  have violated.
- **One shared helper, called by both routes.** `/validate` (client gate) and
  `/publish` (server backstop) now run the *same* code, so they can't drift —
  a recipe the Deploy gate accepts is exactly a recipe publish accepts.
- **Validation strictly before the first `fetch`.** On `!ok` the handler
  returns before reading the `dev` ref, so no branch or PR is ever created —
  there is no orphaned-resource cleanup path to get wrong.
- **Client left untouched.** The plan's open question (does the client need to
  render the new `400 { issues }`?) resolved to "surface `error` only": the
  client Deploy gate makes this path normally unreachable from the UI, so a
  dedicated issues UI would be dead code.
- **Persists the raw recipe, not the parsed `validation.data`.** Code review
  noted publish writes the raw body rather than the Zod-parsed object (which may
  carry schema defaults). Left as-is — it matches prior behaviour and changing
  what gets persisted is out of scope for this hardening.

## Open questions

- None blocking. The raw-vs-parsed-recipe observation above is a possible future
  follow-up, not a defect in this change.
