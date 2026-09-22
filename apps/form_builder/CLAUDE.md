# CLAUDE.md — apps/form_builder

The no-code Form Builder. Nx project `form-builder-app` (not `form_builder`); TanStack Start + Nitro
SSR on Amplify compute, Lexical editor, dnd-kit, TanStack AI. Read the root `CLAUDE.md` first; this
file adds what is specific here.

## Layout

- The source root is `app/`, not `src/`. Routes split into `app/routes/{auth,builder,content}`;
  server functions live under `app/server/`.
- Shared UI primitives and their rules: `app/components/ui/README.md`. Product intent: `PRODUCT.md`;
  behaviour spec: `SPEC.md`.

## Deploy PRs are joined by branch label, never by form id

Publishing a form or a start page opens a PR through `@govtech-bb/git-publish`. Branch names are
fitted to the 63-character Amplify preview label by `fitBranchSegment` in
`packages/form-types/src/deploy-branch.ts`, so a branch carries a _label_ derived from the id, not
necessarily the id. Find the open PR for a form with
`formIdFromDeployBranch(headRef) === deployBranchLabel(formId)` — see `app/server/publish.ts` and
`app/components/builder/use-forms-list.ts`; start-page branches use the same fitter in
`app/server/content.ts`. Comparing to `formId` directly silently detaches a form from its PR
(ADR 0070).

## Rules that reach outside this app

- The AI assist streams edits the client reviews before applying (ADR 0072). Its rulesets live in
  `apps/form_builder_api/src/ai/system-prompt.ts` and `content-prompt.ts`; the `form-design` and
  `service-page-content` skills read those same files.
- Content the builder publishes lands in `apps/landing/src/content/`; CI's generated-files job
  regenerates the services index for it.
- Lexical moves fast: check upstream releases and changelogs before hand-rolling an editor fix.

## Checks

- `pnpm exec nx run form-builder-app:test` (Vitest).
- This app is not in the root `tsc -b` graph and CI does not type-check it. Run
  `pnpm exec tsc --noEmit -p apps/form_builder` before pushing.
