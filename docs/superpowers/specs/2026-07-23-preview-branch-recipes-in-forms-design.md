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
- **In-browser hydration** (bundle raw recipes + `hydrateForm` into the client): pulls API resolution + registry into the client bundle, larger, diverges more from prod, and would bake `processors` config (webhook endpoints, `secretEnv` names) into the public bundle — a secret-adjacent leak the API deliberately avoids by stripping `processors`. Rejected.
- **Static "preview API"** (serve generated JSON over the network from the preview Amplify app): more moving parts than the existing build-time static-import seam. Rejected.
- **Move recipes to a shared package + bake all contracts at build (SSG) for every environment:** would make previews native and drop the API round-trip, but is **not** behaviour-preserving — visibility, maintenance mode and recipe changes would need a forms rebuild instead of a live `service_status` DB toggle. Rejected on the behaviour-preserving requirement.
- **Per-branch API (Option 4):** full fidelity but heavy ECS/DB infra + cost. Out of scope; noted as the upgrade path if fidelity needs grow.

## Decisions & deferred scope

Recorded from the design discussion so the reasoning survives:

- **Fidelity = render + flow only.** The reviewer walks the form and sees fields/validation/conditional logic; real submission, server-side visibility, and webhook/email processors are explicitly out of scope. This is what unlocked the cheap build-time approach over a per-branch API.
- **API stays the runtime source of truth.** All dynamic, DB-backed behaviour (visibility/maintenance via `service_status`, processor merge via `form_config`, `?preview=`/`?draft=` tokens) remains server-side and unchanged. The preview path is additive and only active under `VITE_PREVIEW_CONTRACTS`.
- **Recipe-file relocation to a shared package is DEFERRED.** Moving `recipes/*.json` into `packages/form-recipes` is organizational only — it does **not** make the preview cheaper (the generator reads recipes just as easily in place) and it touches the production deploy path (the `__dirname`-relative `DEFAULT_RECIPES_ROOT` in `recipe-file-loader.service.ts`, the nx `assets` glob in `apps/api/project.json`, and the `COPY` in `apps/api/Dockerfile`), plus `scripts/validate-recipes.ts`, `scripts/collapse-recipe-versions.ts`, `packages/database/scripts/dump-recipes-to-files.ts`, and two specs. Given the blast radius (a wrong asset path = every form 404s in prod) against a purely cosmetic benefit, it is tracked as a separate follow-up, not part of this work.
- **Extracting `resolution.ts` into a package is also deferred** for the same reason — the generator imports it in place. It is already pure, so packaging it later is low-risk if a second consumer appears.

## Components

### 1. Contract generator

A standalone `tsx` script, `scripts/generate-preview-contracts.ts`, modelled on the existing [scripts/validate-recipes.ts](../../../scripts/validate-recipes.ts) (same cross-package import style, same `fs.readdir` over the recipes dir) and exposed as a root `package.json` script. It reads recipes **in place** — no relocation of the recipe files (see [Decisions](#decisions--deferred-scope)):

- Imports `hydrateForm` (+ `UnresolvableComponentError`) from `apps/api/src/registry/resolution.ts`, `BUILTIN_REGISTRY` from `@govtech-bb/registry`, and `serviceContractRecipeSchema` + `serviceContractSchema` from `@govtech-bb/form-types`.
- Reads **all** recipes from `apps/api/src/forms/form-definitions/recipes/*.json` (scope decision: generate all — recipes are tiny and this avoids wiring nx-affected recipe detection).
- Validates each raw recipe with `serviceContractRecipeSchema` (the same schema the runtime loader applies), hydrates it with a `BUILTIN_REGISTRY`-backed resolver, and validates the output against `serviceContractSchema`.
- **Strips `processors`** from the hydrated contract before writing — the runtime API strips them on the public/client path (`findByFormId`), so we must too, or webhook/processor config (endpoints, `secretEnv` names, mappings) would be baked into the public preview bundle.
- Writes one file per form to `apps/forms/contracts/preview/<formId>.json`.
- **Fails loudly** (non-zero exit) if a recipe references a non-builtin component (`UnresolvableComponentError`) — so the preview never silently diverges from what the API would serve.

The generated dir (`apps/forms/contracts/preview/`) is git-ignored (build artifact, not checked in). The generator does not import NestJS, touch a DB, or need secrets — matching `resolution.ts`'s purity.

### 2. Forms loader — prefer bundled contract in preview mode

Extend `fetchContract` in [apps/forms/src/lib/form-builder/form-fetcher.ts](../../../apps/forms/src/lib/form-builder/form-fetcher.ts) (the existing static-contract seam) so that:

- When `import.meta.env.VITE_PREVIEW_CONTRACTS` is set, **prefer** the bundled `apps/forms/contracts/preview/<formId>.json` if one exists for the requested `formId` — return it (mapped to locale) without hitting the network. If none exists, fall through to the normal API fetch.
- **Prefer, not fall-back-on-404**: because the generator emits **all** recipes, a form that was *changed* in the branch (not just newly added) also has a bundled contract; preferring it means the preview reflects the branch, not a stale sandbox copy. A 404-only fallback would show the old version of changed forms.
- Bundled contracts are discovered via Vite `import.meta.glob("../../../contracts/preview/*.json")`; in normal builds the dir is empty so the glob yields nothing and behaviour is unchanged.
- When the flag is unset (production, sandbox, normal local dev, and normal frontend-only PR previews), the whole branch is dead code — no bundled contracts referenced.

### 3. Submission short-circuit

In preview mode (`VITE_PREVIEW_CONTRACTS` set), a real `POST /submissions` to sandbox would fail because the branch form doesn't exist there. Short-circuit `postFormSubmission` in [apps/forms/src/lib/api/forms.ts](../../../apps/forms/src/lib/api/forms.ts) to return a synthetic success envelope (a clearly-fake `referenceCode` such as `PREVIEW-NOT-SAVED`), so the existing `resolveSubmissionOutcome` → `setSubmissionState` machinery advances to the confirmation step. This path is only reachable when the flag is set; nothing is persisted.

### 4. CI wiring

The forms build does **not** run in [.github/workflows/pr-preview.yml](../../../.github/workflows/pr-preview.yml); that job only triggers an Amplify `RELEASE` job, and the actual build runs on Amplify's servers via the repo-root [amplify.yml](../../../amplify.yml). So the wiring spans three files:

- **[amplify.yml](../../../amplify.yml) forms `build` phase:** add a command *before* `forms:build` that runs the generator **only when the flag is set** — `- if [ "$VITE_PREVIEW_CONTRACTS" = "1" ]; then pnpm generate:preview-contracts; fi`. Sandbox/prod never set the flag, so they never generate and are untouched.
- **[pr-preview.yml](../../../.github/workflows/pr-preview.yml) `setup` job:** a recipe JSON is not a forms nx-dependency, so a recipe-only PR leaves `forms` unaffected and no forms preview would build. Detect changed `recipes/*.json` files, force `forms=true` when any changed, and emit their formIds as a `preview-recipe-ids` output.
- **[pr-preview.yml](../../../.github/workflows/pr-preview.yml) `preview-forms` job:** when `preview-recipe-ids` is non-empty, set `VITE_PREVIEW_CONTRACTS=1` as a **branch-scoped** Amplify env var via `aws amplify update-branch --environment-variables` (mirroring the existing `preview-analytics` pattern) before `start-job`. Gating on recipe changes means normal frontend-only previews keep talking to the sandbox API with real submissions — behaviour preserved.
- **[pr-preview.yml](../../../.github/workflows/pr-preview.yml) `comment` job:** append direct `<FORMS_URL>/forms/<formId>` link(s) for the changed recipes to the sticky preview comment, so reviewers click straight through. (Direct-link only — the forms index is not modified.)
- **[pr-preview.yml](../../../.github/workflows/pr-preview.yml) `smoke-test-forms-preview` job:** gate off when `preview-recipe-ids` is non-empty. That smoke submits the jobstart form **for real** and asserts the confirmation; in recipe-preview mode submissions are stubbed and contracts are bundled, so it can't run meaningfully (mirrors the existing `preview-smoke-contract-changed` hatch; post-deploy smoke covers it). The a11y job never submits and keeps running.

## Data flow

```
branch recipe JSON
  → hydrateForm(recipe, BUILTIN_REGISTRY resolver)     [Amplify build phase, when VITE_PREVIEW_CONTRACTS=1]
  → strip processors → serviceContractSchema validate
  → apps/forms/contracts/preview/<formId>.json          [bundled into the forms preview build by nx/Vite]
  → forms loader (preview mode): prefer bundled contract for the formId
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
- **Cross-app import (a root script reaching into `apps/api` internals).** The generator imports `apps/api/src/registry/resolution.ts` directly; the forms app itself only imports generated JSON, never `apps/api`. This root-script → app-internal reach is the one slightly unusual coupling (the existing `validate-recipes.ts` only reaches into packages, not app source). It's confined to the *pure* `resolution.ts` + the two packages and is tolerable for a build tool; if it ever grates, the clean resolution is the deferred `resolution.ts` package extraction — no redesign needed.
```
