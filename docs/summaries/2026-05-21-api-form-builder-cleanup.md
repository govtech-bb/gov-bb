# API Form-Builder Cleanup — Session Summary

**Date:** 2026-05-21
**Branch:** service/api-builder-cleanup (off origin/dev)
**Plan:** `docs/plans/api-builder-cleanup.md`
**Issues:** #42 (this work), #48 (frontend follow-up)

## Context

The `FormBuilderModule` in `apps/api` was duplicate dead weight — the form-builder logic moved to `apps/form_builder/` long ago, and the Nest module had no remaining callers inside the API. It also shipped two heavy AI SDKs (`@anthropic-ai/sdk`, `@aws-sdk/client-bedrock-runtime`) on every API image. Plan called for a straight deletion.

## What was done

- Deleted `apps/api/src/form-builder/` (~2050 lines).
- Unhooked from `app.module.ts`; dropped the `50mb` body-parser overrides from `main.ts`; removed `AI_PROVIDER` / `AI_MODEL` / `ANTHROPIC_API_KEY` validators; cleaned `nest-cli.json` asset entry and `jest.config.ts` coverage exclusion.
- Removed two orphaned deps (`-207` transitive packages).
- Fixed `apps/api/Dockerfile` — a `COPY` of the deleted prompts dir would have broken image builds (plan miss).

## Why it looks the way it does

**Branched off `dev`, not `main`, in a worktree.** Another session was active on the parent branch (`service/improved-formbuilder-deployment`), and team flow merges feature work into `dev` before `main`. Worktree under `.claude/worktrees/` keeps the cleanup isolated.

**Dropped `@aws-sdk/client-bedrock-runtime` even though the plan only named `@anthropic-ai/sdk`.** Same orphaning argument: after deleting `form-builder/`, nothing else in `apps/api/src/` references either SDK. The plan's wording (`@anthropic-ai/sdk`, "anything PDF-related referenced only inside form-builder/") missed that the Bedrock provider was the same class of orphan. Left in, it'd be ~20MB of unused SDK on every API image.

**Dockerfile fix wasn't in the plan but had to land in this PR.** Line 66 of the Dockerfile copied `/app/apps/api/src/form-builder/prompts/` into the runtime image. Once the source is deleted, the `COPY` fails and the API image doesn't build — caught by widening the grep beyond `apps/api/src/` to `apps/api/`. The plan only enumerated source files; everything under `apps/api/` that referenced the module needed to be in scope.

**Plan filter was a typo (`@gov-bb/api`), real name is `@govtech-bb/api`.** No code change needed, just used the right name when running pnpm. Worth noting if anyone follows the plan's `## Verify` block verbatim.

**No "Form Builder" Swagger tag edit needed.** The plan listed "Swagger no longer lists the `Form Builder` tag" as a verification step, implying an edit somewhere. The tag came from the `@ApiTags("Form Builder")` decorator on the deleted controller — not from `main.ts`'s static `addTag` calls. Deleting the controller removes the tag automatically.

**Coverage thresholds untouched.** Removing `!**/form-builder/**` from the jest exclusion list is a no-op (the directory itself is gone). Coverage numbers stayed at 83.18% statements — same as baseline.

## Verified

- `nx build api` (+ 4 workspace deps) — clean.
- `pnpm --filter @govtech-bb/api test` — 43 suites, 363/363 pass.
- `grep -rn "form-builder\|FormBuilder\|ANTHROPIC_API_KEY\|AI_PROVIDER\|AI_MODEL\|@anthropic-ai/sdk\|@aws-sdk/client-bedrock-runtime" apps/api` — empty.
- `start:dev` Swagger boot — **not run**; requires DB credentials not available in this session. Build success + module unwiring makes a Swagger regression unlikely.

## Open questions

- **Frontend consumers ship 404s until #48 lands.** `apps/form_builder/` and `apps/forms/src/routes/admin/form-builder.tsx` still call the deleted routes. Tracking issue filed; sequencing the API merge vs the FE removal is a release-coordination call.
