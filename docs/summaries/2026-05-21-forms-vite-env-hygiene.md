# Forms App — Vite Frontend Env Exposure Cleanup

**Branch:** `fix/forms-vite-env-hygiene`
**Issue:** [#20](https://github.com/govtech-bb/gov-bb/issues/20)
**Plan:** [docs/plans/forms-vite-env-hygiene.md](../plans/forms-vite-env-hygiene.md)
**Decision:** [docs/decisions/0005-vite-env-vars-use-import-meta-env-only.md](../decisions/0005-vite-env-vars-use-import-meta-env-only.md)

## Context

Sandbox security review (audit finding Web #11, filed as issue #20) flagged two problems in `apps/forms`:

1. `SKIP_CONTINUE_VALIDATION=true` shipped as the default in `.env.example`. Any developer following onboarding got a bundle that silently bypassed step validation. The flag was wired into the prod bundle via a `define` block; a misconfigured prod env inheriting the example would expose the bypass to citizens.
2. `vite.config.ts` used `loadEnv(mode, cwd, "")` with an empty prefix and a `define` cherry-pick of three vars (`VITE_API_URL`, `DESIGN_SYSTEM`, `SKIP_CONTINUE_VALIDATION`). The pattern relied on reviewer discipline to avoid accidentally adding a secret — no structural guardrail.

A side-issue: `apps/forms/src/lib/api/forms.ts` read `process.env.VITE_API_URL` while `apps/forms/src/routes/admin/form-builder.tsx` already read `import.meta.env.VITE_API_URL`. Inconsistent and a hint that the codebase already had one foot in the idiomatic pattern.

## What we did

**One PR's worth of scope.** Closed both problems and the inconsistency:

- `apps/forms/vite.config.ts` — dropped `loadEnv("")` and the entire `define` block. Config is now a flat `defineConfig({...})`.
- `apps/forms/src/components/form-renderer.tsx` — replaced the four-line `process.env.SKIP_CONTINUE_VALIDATION` runtime check with `if (!import.meta.env.DEV) return;`. The bypass is now reachable only in dev builds; the entire branch is statically tree-shaken from prod bundles.
- `apps/forms/src/lib/design-system/index.ts` — reads `import.meta.env.VITE_DESIGN_SYSTEM`.
- `apps/forms/src/lib/api/forms.ts` — reads `import.meta.env.VITE_API_URL`. Both `VITE_API_URL` callsites now agree.
- `apps/forms/.env.example` — `DESIGN_SYSTEM` → `VITE_DESIGN_SYSTEM`; removed `SKIP_CONTINUE_VALIDATION` (no longer needed); removed dead `DEVELOPMENT=true;` (search confirmed no code reads it).

**Unplanned test-infra work.** Running the existing Jest suite revealed that ts-jest in CommonJS mode (per [decision 0002](../decisions/0002-web-jest-uses-separate-tsconfig.md)) cannot parse `import.meta` — it's a language-level constraint of CommonJS, not a config knob. The pre-existing `import.meta.env.VITE_API_URL` reference in `routes/admin/form-builder.tsx` didn't trip on this because that route file isn't covered by any spec; the moment `lib/api/forms.ts` switched (which *is* loaded transitively by `form-query.spec.ts`), two suites failed to compile. Two options surfaced: (a) shim `import.meta.env` in Jest config, or (b) keep `lib/api/forms.ts` on `process.env` and restore part of the `define` block.

Picked (a). Added `ts-jest-mock-import-meta` as a workspace devDependency and wired it as an AST transformer in `apps/forms/jest.config.ts` with stub values (`DEV: true`, `VITE_API_URL`, `VITE_DESIGN_SYSTEM`, etc.). Option (b) would have left the ADR with an exception from day one and kept half the antipattern alive — paying down the test-infra cost once was the better trade. The constraint is now captured in ADR-0005's Consequences section so the next Vite app added to the monorepo knows to do the same wiring upfront.

## Key decisions

- **`SKIP_CONTINUE_VALIDATION` gated to `import.meta.env.DEV`, not removed.** The flag had a real local-dev purpose (clicking through forms past validation without filling required fields). Removing it would have made dev slightly worse without paying for itself. Gating to `DEV` keeps the convenience and makes the bypass structurally unreachable in production — Vite resolves `import.meta.env.DEV` statically at build time and tree-shakes the branch.
- **Renamed `DESIGN_SYSTEM` → `VITE_DESIGN_SYSTEM`.** The whole point of going idiomatic was to delete the `define` shim. To do that, every env var the browser needs has to actually be `VITE_`-prefixed so Vite's built-in exposure machinery handles it. `VITE_API_URL` was already prefixed; `DESIGN_SYSTEM` was not. The rename is mechanical — three code/config files plus the Amplify console — and unblocks dropping `define`.
- **Removed dead `DEVELOPMENT=true;` from `.env.example`.** Search across the repo showed no code reads it. Cleaning it up while in the file rather than leaving a confusing leftover.
- **Convention captured as ADR-0005.** The decision to standardize on `import.meta.env.VITE_*` (and use `import.meta.env.DEV` for dev-only flags, never custom runtime env vars) generalises beyond this issue. Future Vite-app additions in the monorepo should follow it without re-discovering the same arguments.

## Alternatives considered and rejected

- **Remove `SKIP_CONTINUE_VALIDATION` entirely** (issue's first suggestion). Rejected — kills a real local-dev convenience for no extra safety benefit over the `DEV`-gate approach.
- **Flip `.env.example` default to `false`, leave everything else.** Rejected — does nothing for anyone who already copied the file, and leaves the `define` antipattern intact.
- **Keep `define` with an audited allowlist + "no secrets" comment.** Rejected — the antipattern survives, and reviewer discipline is exactly the failure mode the audit was complaining about.
- **Bundle the wider `@govtech-bb/styles` design-system migration into this PR.** Rejected — that's a separate concern (issue #37, deprioritized this session) with a much larger surface. The `DESIGN_SYSTEM` *env var* rename is small and mechanical; the *design system package* migration is not.

## Verification

- `vite build` — succeeded.
- `grep -r SKIP_CONTINUE_VALIDATION apps/forms/dist` — empty. The bypass path is statically removed from prod bundles.
- `grep -rE '[^E]DESIGN_SYSTEM' apps/forms/dist` — empty. Only `VITE_DESIGN_SYSTEM` survives.
- `grep -r 'process\.env' apps/forms/dist` — empty. The `define` shim is gone.
- `grep -rn 'process.env' apps/forms/src` — empty. All callsites moved to `import.meta.env`.
- `tsc --build` — exit 0 across the workspace. The `vite/client` types in `apps/forms/tsconfig.json` cover the new `import.meta.env.DEV` and `import.meta.env.VITE_*` references.
- `pnpm test` (apps/forms Jest suite, post-transformer fix) — 7/7 suites pass, 51/51 tests, all four coverage thresholds met.
- ESLint: not run. Pre-existing `eslint-plugin-react` / ESLint 9 compat bug (`sourceCode.getAllComments is not a function`) fails on `basic.module.css` before reaching any of the edited files. Unrelated to this change.
- Prod-preview manual click-test: not run. The static-analysis grep proves the bypass code is absent from the prod bundle; the runtime behaviour follows.

## Operational coordination

Amplify console: add `VITE_DESIGN_SYSTEM` (same value as the existing `DESIGN_SYSTEM`) to **sandbox** and **prod** environments before merging. If the merge lands first, the design system silently falls back to `basic` with a console warning (`src/lib/design-system/index.ts:14-18`) — visible regression but not catastrophic. The old `DESIGN_SYSTEM` env var becomes dead config after merge and can be removed as housekeeping.

Confirmed by the user that the Amplify env var was added before the implementation session.
