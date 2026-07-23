# Preview branch-only form recipes in PR previews

**Date:** 2026-07-23
**Status:** Draft — awaiting review

## Problem

A new form is authored as a recipe JSON file in `apps/api/src/forms/form-definitions/recipes/*.json`. We want a **pre-merge sign-off gate**: on any PR that adds or changes a recipe, a reviewer should be able to open the PR-preview forms link and walk through the new form before it merges.

Today this is impossible. PR previews rebuild only the **frontend** Amplify apps; `apps/api` is not deployed per-branch. Every PR-preview forms app talks to the **fixed sandbox API** (`forms.api.sandbox.alpha.gov.bb`), and that API serves recipes from files read once at boot from its own deployed build ([ADR 0007](../../decisions/0007-runtime-recipes-load-from-files-not-form_definitions-table.md)). A recipe that exists only in the PR branch is served nowhere the preview can reach. The existing `?preview=`/`?draft=` tokens don't help — they surface forms that already exist on the API the preview talks to, not JSON that lives only in the branch. This skew is called out in [pr-preview.yml:135-147](../../../.github/workflows/pr-preview.yml) and [ADR 0030](../../decisions/0030-per-pr-preview-smoke-tests-gate-the-frontend.md).

## Goal & scope

- **In scope:** Render + flow fidelity. A reviewer opens a direct link to the branch's new/changed form on the PR-preview forms app, sees all steps, fields, validations and conditional logic, and can walk through to the confirmation screen.
- **Out of scope (deferred to a hypothetical Option 4 — per-branch API):** real submission persistence, server-side visibility resolution, webhook/email processors, and the forms index page listing branch-only forms. Submission does **not** need to save.

## Key facts this design relies on

1. The forms app consumes a resolved **`ServiceContract`** (`packages/form-types/src/service-contract.type.ts`, `serviceContractSchema`), a type shared by both `apps/api` and `apps/forms`.
2. The hydration engine that turns a raw recipe into a `ServiceContract` — `hydrateForm`/`hydrateStep` in [apps/api/src/registry/resolution.ts](../../../apps/api/src/registry/resolution.ts) — is a **pure function** of `(recipe, resolver)`. With a resolver backed by `BUILTIN_REGISTRY` (`packages/registry/src/index.ts`) it needs **no DB, no NestJS, no secrets**. Repo recipes are guarded (`scripts/recipe-ref-guards.ts`, the `validate-recipes` job) to use only builtin refs.
3. The forms app already has a **static-contract seam**: `fetchContract` in [apps/forms/src/lib/form-builder/form-fetcher.ts:30-47](../../../apps/forms/src/lib/form-builder/form-fetcher.ts) short-circuits the network for the `"example"`/`"master"` IDs, loading checked-in JSON from `apps/forms/contracts/*.json` and validating it against `serviceContractSchema`.
4. The DB-dependent parts of the real serving path (`FormDefinitionsService.findByFormId`) — the `service_status` visibility gate and the `form_config` processor merge — are wrappers *around* hydration, not part of it. The generator calls `hydrateForm` directly and skips them.

## Approach

Build-time contract generation + a preview-only static fallback in the forms loader.

In the per-PR forms preview build, run the real hydration engine over the branch's recipe files to emit resolved `ServiceContract` JSON, bundle it into the forms build, and have the forms loader fall back to the bundled contract when the sandbox API returns 404 — gated behind a build flag so **production/sandbox forms builds are unchanged**.

Alternatives considered and rejected:
- **In-browser hydration** (bundle raw recipes + `hydrateForm` into the client): pulls API resolution + registry into the client bundle, larger, diverges more from prod. Rejected.
- **Static "preview API"** (serve generated JSON over the network from the preview Amplify app): more moving parts than the existing build-time static-import seam. Rejected.
- **Per-branch API (Option 4):** full fidelity but heavy ECS/DB infra + cost. Out of scope; noted as the upgrade path if fidelity needs grow.

## Components

### 1. Contract generator

A standalone script (run via `tsx`, wired as an nx target), depending only on pure code:

- Imports `hydrateForm` from `apps/api/src/registry/resolution.ts` and `BUILTIN_REGISTRY` from `@govtech-bb/registry`.
- Reads **all** recipes in `apps/api/src/forms/form-definitions/recipes/*.json` (scope decision: generate all — recipes are tiny and this avoids wiring nx-affected recipe detection).
- Validates each raw recipe the same way the loader does, hydrates it with a `BUILTIN_REGISTRY`-backed resolver, and validates the output against `serviceContractSchema`.
- Writes one file per form to `apps/forms/contracts/preview/<formId>.json`.
- **Fails loudly** (non-zero exit) if a recipe references a non-builtin component, mirroring `UnresolvableComponentError` — so the preview never silently diverges from what the API would serve.

The generated dir is git-ignored (build artifact, not checked in).

### 2. Forms loader fallback

Extend the contract fetch path (`fetchFormDefinition` in `apps/forms/src/lib/api/forms.ts`, surfaced through `contractQueryOptions`) so that:

- When `import.meta.env.VITE_PREVIEW_CONTRACTS` is set **and** the API responds 404 for a `formId`, load the bundled `apps/forms/contracts/preview/<formId>.json`, validate against `serviceContractSchema`, and return it.
- When the flag is unset (production, sandbox, normal local dev), behaviour is unchanged — no fallback, no bundled preview contracts referenced.

### 3. Submission short-circuit

In preview mode (`VITE_PREVIEW_CONTRACTS` set), a real `POST /submissions` to sandbox would 404 because the form doesn't exist there. Short-circuit submission client-side to a synthetic success so the reviewer reaches the confirmation screen. This path is only reachable when the flag is set.

### 4. CI hook

In the `preview-forms` job of [.github/workflows/pr-preview.yml](../../../.github/workflows/pr-preview.yml):

- Run the contract generator before the forms build.
- Set `VITE_PREVIEW_CONTRACTS=1` for that build only.
- Append the direct `/forms/<formId>` preview link(s) for the recipes changed in the PR to the existing PR preview comment, so reviewers click straight through. (Direct-link only — the forms index is not modified.)

## Data flow

```
branch recipe JSON
  → hydrateForm(recipe, BUILTIN_REGISTRY resolver)   [build time, in CI]
  → serviceContractSchema validate
  → apps/forms/contracts/preview/<formId>.json         [bundled into forms preview build]
  → forms loader: API 404 + VITE_PREVIEW_CONTRACTS → load bundled contract
  → same ServiceContract, same renderer as production
```

Only the *source* of the contract differs from production; the shape, schema, and renderer are identical.

## Testing

- **Generator unit test:** given a known recipe fixture, asserts the emitted contract parses under `serviceContractSchema` and matches the shape the API's `findByFormId` produces for the same recipe (structural parity on the fields hydration copies).
- **Generator guard test:** a recipe with a non-builtin ref causes a non-zero exit / thrown error.
- **Forms loader test:** with `VITE_PREVIEW_CONTRACTS` set and fetch stubbed to 404, the loader returns the bundled preview contract; with the flag unset, a 404 propagates as today (no fallback).
- **Submission short-circuit test:** with the flag set, submit resolves to the synthetic success without hitting the network; with it unset, submit posts as today.
- Run `apps/api` + `apps/forms` test projects (per the recipe-test-scope convention) plus the touched packages; run the build before pushing.

## Risks & mitigations

- **Divergence from prod hydration.** Mitigated by importing the *same* `hydrateForm` and `BUILTIN_REGISTRY` the API uses, and validating output against the shared `serviceContractSchema`. If a recipe uses a custom (DB-backed) component, the generator fails loudly rather than emitting a wrong contract.
- **Preview code leaking into production.** Mitigated by the `VITE_PREVIEW_CONTRACTS` flag being set only in the `preview-forms` CI job; all fallback/short-circuit code is dead unless the flag is set. No preview token or secret is involved, so nothing sensitive is bundled.
- **Cross-app import (`apps/forms` build depending on `apps/api` resolution code).** The generator, not the forms app, imports `resolution.ts`; the forms app only imports generated JSON. Keep the generator as a build step whose dependency on `apps/api` is confined to the pure `resolution.ts` + the two packages.
```
