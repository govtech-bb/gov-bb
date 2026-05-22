# Forms App — Vite Frontend Env Exposure Cleanup

**Issue:** [govtech-bb/gov-bb#20](https://github.com/govtech-bb/gov-bb/issues/20)

## Goal

Close the validation-bypass risk and the wholesale-`process.env` antipattern in `apps/forms`, leaving the app on Vite's idiomatic env-var pattern with the `define` workaround removed.

## Approach

1. **Gate `SKIP_CONTINUE_VALIDATION` to dev-only.** Replace the runtime check with `import.meta.env.DEV` — a static value Vite tree-shakes out of production bundles. The bypass becomes unreachable in prod regardless of env state.

   *Alternatives considered:* remove entirely (rejected — kills a real local-dev convenience); flip `.env.example` default to `false` (rejected — doesn't help anyone who already copied the file).

2. **Drop the `define` block; use `import.meta.env.VITE_*` natively.** Removes the wholesale `process.env` exposure pattern. Requires renaming `DESIGN_SYSTEM` → `VITE_DESIGN_SYSTEM` so Vite's prefix convention can expose it safely.

   *Alternative considered:* keep `define` with an audited allowlist + comment (rejected — leaves a fragile pattern a future contributor can break by accident).

3. **Fix the `VITE_API_URL` callsite inconsistency** as a side-effect of step 2. Both callsites converge on `import.meta.env.VITE_API_URL`.

## Scope

- `vite.config.ts`: drop the `loadEnv("")` empty-prefix call and the entire `define` block.
- `SKIP_CONTINUE_VALIDATION`: gated to `import.meta.env.DEV` in `form-renderer.tsx`; removed from `.env.example`.
- `DESIGN_SYSTEM` → `VITE_DESIGN_SYSTEM` in code, `.env.example`, and Amplify console (sandbox + prod).
- `VITE_API_URL` callsite in `lib/api/forms.ts` switched from `process.env` to `import.meta.env`.
- Drop the unused `DEVELOPMENT=true;` line from `.env.example` — dead entry, no code reads it.

**Out of scope:**

- Deciding the fate of `src/routes/admin/form-builder.tsx` ([#48](https://github.com/govtech-bb/gov-bb/issues/48) owns that).
- Wider env-handling audit across other apps (`landing`, `form_builder`, `chat`).

## Files

- `apps/forms/vite.config.ts` — drop `loadEnv` + `define`.
- `apps/forms/.env.example` — rename `DESIGN_SYSTEM`, remove `SKIP_CONTINUE_VALIDATION`, remove dead `DEVELOPMENT`.
- `apps/forms/src/components/form-renderer.tsx:202-203` — replace runtime check with `import.meta.env.DEV`.
- `apps/forms/src/lib/design-system/index.ts:11` — read `import.meta.env.VITE_DESIGN_SYSTEM`.
- `apps/forms/src/lib/api/forms.ts:22` — `import.meta.env.VITE_API_URL`.

## Branch

`fix/forms-vite-env-hygiene` off `dev`.

## Operational coordination

**Before merging**, in Amplify console for both **sandbox** and **prod** environments:

- Add `VITE_DESIGN_SYSTEM` with the same value as the existing `DESIGN_SYSTEM`.
- Leave the old `DESIGN_SYSTEM` set; it becomes dead config after merge — clean it up as a follow-up.

Adding the new name first (vs renaming in lockstep) leaves a brief overlap where both are set — fine, only the new one will be read once the code lands. If Amplify isn't updated and the merge happens, the design system silently falls back to `basic` with a console warning (per `src/lib/design-system/index.ts:14-18`) — visible regression but not catastrophic.

## Verify

1. **Local dev:** fresh copy of `.env.example` → `.env`, `npm run dev:forms`. Form loads using the design system specified by `VITE_DESIGN_SYSTEM`. Continue-with-errors still works.
2. **Prod-bundle sanity:** `npm run build` in `apps/forms`, then `grep -r SKIP_CONTINUE_VALIDATION dist/` returns nothing — bypass path tree-shaken out.
3. **Prod-mode preview:** `npm run preview`, fill a form with errors, click Continue. Should **block** navigation. (Today, with `SKIP_CONTINUE_VALIDATION=true` baked in via `define`, it doesn't.)
4. **No callsite regressions:** `grep -rn "process.env" apps/forms/src` returns only legitimate Node usage (test/config files), no application code.
5. **Sandbox post-deploy:** form renders with the configured design system, confirming the Amplify env rename took effect.

## Open questions

- Who uses `SKIP_CONTINUE_VALIDATION` in their dev workflow? The `import.meta.env.DEV` gate keeps it functional. If nobody uses it, the code path can be deleted in a follow-up.
- Confirm Amplify console access with whoever owns the deploys before merging.
