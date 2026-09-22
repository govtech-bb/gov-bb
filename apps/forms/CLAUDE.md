# CLAUDE.md — apps/forms

The citizen-facing form renderer. Nx project `forms`; Vite + React SPA deployed as a static site on
Amplify. Read the root `CLAUDE.md` first; this file adds what is specific here.

## Rendering

- Fields render through a hand-rolled dispatch over `@tanstack/react-form`'s field API in
  `src/components/field-renderer/index.tsx`; there is no `createFormHook` layer. Recipes come from
  the api (`form-design` skill owns their shape).
- Components come from the external design system, chiefly `@govtech-bb/react`.
- This app carries its own `eslint.config.ts`; the root config ignores `apps/forms/**`.

## Three Playwright configs — keep them apart

| Script                                       | Config                       | What it does                                                                            |
| -------------------------------------------- | ---------------------------- | --------------------------------------------------------------------------------------- |
| `pnpm --filter @govtech-bb/forms test:e2e`   | `playwright.config.ts`       | Mocked journeys against a local Vite server. Safe anywhere.                             |
| `pnpm --filter @govtech-bb/forms test:smoke` | `playwright.smoke.config.ts` | **Submits real applications** to the target in `SMOKE_BASE_URL` (required, no default). |
| `pnpm --filter @govtech-bb/forms test:a11y`  | `playwright.a11y.config.ts`  | Accessibility scan only (`docs/accessibility-ci-gate.md`).                              |

CI runs the smoke and a11y configs against the PR preview (`pr-preview.yml`) and again after the
sandbox deploy (`deploy-sandbox.yml`). Never point the smoke config at production casually, and
never fold the three configs into one.

## Checks

- `pnpm exec nx run forms:test` (Vitest) and the e2e config above.
- This app is in the root `tsc -b` graph, so `pnpm typecheck` covers it.
