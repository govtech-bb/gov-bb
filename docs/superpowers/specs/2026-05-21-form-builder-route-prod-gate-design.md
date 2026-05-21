# Form-builder route production gate — design

**Issue:** [#12 — Unauthenticated form-builder admin → SSRF/data-exfil chain](https://github.com/govtech-bb/gov-bb/issues/12), link 2 of 4
**Severity:** Critical (issue body) — link 2 hides the admin entry point from anonymous web visitors in production
**Date:** 2026-05-21
**Branch:** `fix/form-builder-route-prod-gate` (off `dev`)

## Problem

`apps/forms/src/routes/admin/form-builder.tsx` registers the route `/admin/form-builder` with no route guard, no `beforeLoad`, and no environment-aware gating. As soon as the `apps/forms` build is deployed, anyone with the URL can load the page, regardless of whether the underlying API is reachable.

PR #74 closed the API side by adding `AdminTokenGuard` — every form-builder API call now returns 401 without a valid `X-Admin-Token` header. But the static page itself still loads and exposes:

- The shape of the API the page expects (route paths, request schemas).
- A visible recon signal that an admin-only feature exists at this URL.
- A 501-line JavaScript bundle that ships to every production user even though only an internal team uses it (a bundle-size concern, not a security concern, but worth noting).

The issue body's suggested resolution names this as link 2 of the 4-link stopgap: *"Disable the `/admin/form-builder` route component when `import.meta.env.DEV` is false."*

## Scope

Single-PR fix:

- New `apps/forms/src/lib/env.ts` exporting `isProdBuild(): boolean`.
- Modify `apps/forms/src/routes/admin/form-builder.tsx` to call `isProdBuild()` from `beforeLoad` and `throw notFound()` in production builds.
- Extract the `beforeLoad` callback as a named export (`adminFormBuilderBeforeLoad`) so the test can call it directly without going through the router's options object.
- New `apps/forms/src/routes/admin/form-builder.spec.tsx` with 2 unit tests — prod throws, dev returns.

**Explicitly out of scope:**

- Code-splitting the 501-line `FormBuilderPage` component out of the prod bundle. The component still ships to prod users; the route is just unreachable. The bundle-size win is real but is a separate optimization PR. The security win we're after lands without it.
- A per-deployment opt-in flag (e.g., `VITE_ENABLE_FORM_BUILDER`). YAGNI for the stopgap — until #11's per-user auth lands, the form-builder workflow runs from local dev or curl against the API.
- A `@Public()` decorator / route-level metadata pattern. Single route being gated; no need for an abstraction.
- Testing through TanStack Router. The router's behavior on `throw notFound()` (which not-found component renders, URL behavior) is library code; we test only our gate.

## Architecture

### New: `apps/forms/src/lib/env.ts`

```ts
/**
 * Whether this code is running in a Vite production build.
 *
 * Wraps `import.meta.env.PROD` so call sites are testable in Jest, which
 * does not natively understand Vite's compile-time env replacements.
 */
export function isProdBuild(): boolean {
  return import.meta.env.PROD;
}
```

One function, one job. The doc comment explains *why* the helper exists (testability), not *what* it does. The helper is one line because Vite replaces `import.meta.env.PROD` with the literal `true` or `false` at build time — there is no runtime decision happening; the helper is purely a Jest-mock target.

### Modified: `apps/forms/src/routes/admin/form-builder.tsx`

Two changes — both in the top of the file. The 480 lines of `FormBuilderPage` body stay untouched.

**Imports**:

```ts
import { createFileRoute, notFound } from "@tanstack/react-router";
import { useState, useRef, useEffect } from "react";
import { isProdBuild } from "../../lib/env";
```

(`notFound` added to the existing `@tanstack/react-router` import; `isProdBuild` is a new import line.)

**Route definition + named gate**:

```ts
export function adminFormBuilderBeforeLoad(): void {
  if (isProdBuild()) {
    throw notFound();
  }
}

export const Route = createFileRoute("/admin/form-builder")({
  beforeLoad: adminFormBuilderBeforeLoad,
  component: FormBuilderPage,
});
```

The named function is exported so the spec file can import it directly. Inline arrows on the route's options object are reachable via `Route.options.beforeLoad` but the generic-parameter cast required in tests is messy; named export sidesteps that.

`throw notFound()` is the canonical TanStack Router signal for "treat this route as not-found." The router catches the throw and renders the closest registered `notFoundComponent`. In this repo that's the global one in `apps/forms/src/routes/__root.tsx:42` (`notFoundComponent: NotFound`) — so prod visitors see the project's existing 404 page, not a generic browser error.

Because `beforeLoad` runs before component instantiation, `FormBuilderPage` never mounts in prod. No `useState`, no `useEffect`, no `fetch` calls to `/form-builder/sessions`. The JS bytecode is in the bundle but inert.

## Information disclosure

We use 404 rather than a "not available" message. The trade-off:

| Option | Recon signal to attacker |
|---|---|
| 404 via `notFound()` | "Could be a typo, could be nothing" |
| Explicit "not available" message | "This route exists, just not callable" — confirms internal admin tooling exists |
| Silent redirect to `/` | "Something weird happens here" — non-obvious recon signal |

For a stopgap that will be replaced by real auth (#11), the 404 path keeps the existence of the admin route ambiguous and matches the behavior of any other unknown URL on the site.

## Tests

### `apps/forms/src/routes/admin/form-builder.spec.tsx` (new)

```tsx
jest.mock("../../lib/env", () => ({
  isProdBuild: jest.fn(),
}));

import { isProdBuild } from "../../lib/env";
import { adminFormBuilderBeforeLoad } from "./form-builder";

const mockIsProdBuild = isProdBuild as jest.MockedFunction<typeof isProdBuild>;

describe("admin/form-builder route gate", () => {
  beforeEach(() => {
    mockIsProdBuild.mockReset();
  });

  it("throws notFound() in a production build", () => {
    mockIsProdBuild.mockReturnValue(true);

    expect(() => adminFormBuilderBeforeLoad()).toThrow();
    expect(mockIsProdBuild).toHaveBeenCalledTimes(1);
  });

  it("returns without throwing in a development build", () => {
    mockIsProdBuild.mockReturnValue(false);

    expect(() => adminFormBuilderBeforeLoad()).not.toThrow();
    expect(mockIsProdBuild).toHaveBeenCalledTimes(1);
  });
});
```

Two cases cover the full branch space of `adminFormBuilderBeforeLoad`. We assert *that* a throw happens but not *what* is thrown — the specific sentinel `notFound()` returns is TanStack Router's internal contract, not ours.

`mockReset()` (not `clearAllMocks`) ensures each test starts with no return value queued; eliminates between-test mock bleed.

The helper itself (`isProdBuild`) is not unit-tested. It's a one-line read of a Vite compile-time replacement that Jest cannot observe meaningfully without runtime env stubbing infrastructure that this repo doesn't have. The only way to catch a regression in the helper (e.g., someone inverts the boolean) is a manual prod build check by the reviewer.

## Local verification (before push)

```bash
# 1. Dev mode — route should work as before
pnpm --filter forms run dev
# Visit http://localhost:3000/admin/form-builder
# Expected: the existing form-builder UI loads (calls will fail with 401
#   because of PR #74's AdminTokenGuard, but the page itself renders).

# 2. Prod build — route should 404
pnpm --filter forms run build
pnpm --filter forms run preview
# Visit http://localhost:4173/admin/form-builder
# Expected: the project's NotFound component renders.

# 3. Verify it's the global NotFound, not a generic browser 404
# Inspect the DOM — the project's branded 404 page should appear.
```

If step 2 shows the form-builder UI instead of NotFound, the gate is wrong (most likely the boolean is inverted). If step 1 shows NotFound instead of the form-builder UI, the gate is *also* wrong (Vite's `PROD` is somehow true in dev, which would be a major Vite-config issue).

## What this PR does not change

- The form-builder API in `apps/api` (already guarded by PR #74).
- Other links of issue #12 (3: `OpencrvsProcessor` URL allowlist; 4: `processors[]` Zod validation).
- Issue #11 (no per-user auth on any controller).
- The 501-line `FormBuilderPage` component itself — only the route registration is touched.
- The two latent bugs from PR #49's smoke test (`GlobalExceptionFilter` 413→500; `app.use(express.json)` shadowing rawBody parser).

## Dependencies

None. `notFound` is already exported by `@tanstack/react-router`, the project's existing router dependency.

## Rollout

Single PR against `dev`. No migration. No feature flag. No operator action required.

**Reviewer action required:** run the manual prod-build check (step 2 above) before approving. The Jest unit test verifies the *gate logic* — only `vite build` + `vite preview` verifies that `import.meta.env.PROD` actually flips to `true` in the built bundle, which is the runtime contract we depend on.

Worst-case rollback: single revert commit. The change is purely additive to the route options; reverting restores anonymous access (which is what we're trying to prevent — but if the gate misbehaves, anonymous-access-restored is still less bad than a broken admin tool in dev).
