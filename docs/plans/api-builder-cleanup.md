# API Form-Builder Cleanup

**Status:** Draft
**Date:** 2026-05-21
**Owner:** IsaiahSama
**Branch:** `service/api-builder-cleanup`
**Issue:** [govtech-bb/gov-bb#42](https://github.com/govtech-bb/gov-bb/issues/42)

## Goal

Remove the legacy `/form-builder/*` routes and supporting code from `apps/api`. All form-builder logic now lives in `apps/form_builder/`; the duplicate Nest module is dead weight and ships unused dependencies (Anthropic SDK, PDF parsing) on the API image.

## Approach

Straight deletion. The `FormBuilderModule` is self-contained — nothing else in `apps/api/src` imports from `form-builder/`, and the AI env validators (`AI_PROVIDER`, `AI_MODEL`, `ANTHROPIC_API_KEY`) are only referenced inside `env.validation.ts` itself. The `50mb` JSON body limit in `main.ts` was added solely for PDF base64 uploads and serves no other route.

**Alternatives considered:**

- *Deprecate-in-place (mark routes as gone but keep the module).* Rejected — no consumers in this repo still call these endpoints; the frontend that did has been excised. Leaving a Nest module around just to host empty controllers would be cargo-culting.
- *Bundle the frontend cleanup in this branch.* Rejected — user scoped this to `apps/api` only. The `apps/form_builder/` and `apps/forms/src/routes/admin/form-builder.tsx` consumers will produce dead 404s until a follow-up branch handles them. Flagged in Open Questions.

## Scope

- Delete `apps/api/src/form-builder/` (entire directory: `form-builder.controller.ts`, `form-builder.service.ts`, `form-builder.module.ts`, `ai.service.ts`, `index.ts`, `dto/`, `prompts/`).
- Unhook `FormBuilderModule` from `apps/api/src/app.module.ts` (import + module-array entry).
- Remove the `50mb` body-parser overrides from `apps/api/src/main.ts` (and the explanatory comment) — Nest reverts to its default ~100kb JSON body limit. Other routes use multipart for file uploads, so they're unaffected.
- Remove `AI_PROVIDER`, `AI_MODEL`, `ANTHROPIC_API_KEY` (and the section comment) from `apps/api/src/config/env.validation.ts`.
- Remove the `form-builder/prompts/**/*.md` asset entry from `apps/api/nest-cli.json`.
- Remove the `!**/form-builder/**` exclusion from `apps/api/jest.config.ts`'s `coveragePathIgnorePatterns`.
- Check `apps/api/package.json` for now-orphaned dependencies (`@anthropic-ai/sdk`, anything PDF-related referenced only inside `form-builder/`) and drop them.

## Files

**Delete (recursively):**

- `apps/api/src/form-builder/`

**Modify:**

- `apps/api/src/app.module.ts`
- `apps/api/src/main.ts`
- `apps/api/src/config/env.validation.ts`
- `apps/api/nest-cli.json`
- `apps/api/jest.config.ts`
- `apps/api/package.json` (if orphaned deps confirmed)

## Verify

- `pnpm --filter @gov-bb/api typecheck` passes.
- `pnpm --filter @gov-bb/api build` succeeds.
- `pnpm --filter @gov-bb/api test` passes.
- `pnpm --filter @gov-bb/api start:dev` boots without errors and Swagger no longer lists the `Form Builder` tag.
- `grep -r "form-builder\|FormBuilder" apps/api/src` returns nothing.

## Open questions

- **Frontend follow-up.** `apps/form_builder/` and `apps/forms/src/routes/admin/form-builder.tsx` still call these routes. Out of scope for this branch — tracked in [govtech-bb/gov-bb#48](https://github.com/govtech-bb/gov-bb/issues/48).
- **Dependency audit.** Need to confirm during implementation whether `@anthropic-ai/sdk` (or similar) is listed in `apps/api/package.json` and whether anything outside `form-builder/` references it before removing.
