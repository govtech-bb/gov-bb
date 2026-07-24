# Render forms inside `apps/landing` — design

**Date:** 2026-07-24
**Status:** Approved (design) — pending implementation plans
**Author:** Shannon Clarke (with Claude)

## Summary

Move government form rendering out of the standalone `apps/forms` SPA and into
`apps/landing`, so that content pages and their forms live in one app with no
cross-app hyperlink. `apps/landing` becomes the **sole host** for forms,
fetching each form's resolved contract from `apps/api` (`GET
/form-definitions/:id`) and rendering it with a new shared
`packages/form-renderer` package. The standalone `apps/forms` app and the
`forms.gov.bb` subdomain are retired, with `forms.gov.bb` kept only as a 301
redirector for existing links.

The work is split into three independently shippable phases:

- **Phase 0** — extract the renderer into `packages/form-renderer` (zero
  behaviour change; `apps/forms` refactored to consume it).
- **Phase 1** — `apps/landing` renders forms (coexistence: `apps/forms` still
  runs).
- **Phase 2** — cutover: `apps/landing` becomes sole host; `apps/forms`
  retired.

Each phase gets its own implementation plan. Phase 0 is specified in most
detail here because it is the enabler everything else depends on.

## Motivation

Today a citizen reads service guidance on `apps/landing`
(`gov.bb/<service>`) and clicks a **"Start now"** button that hyperlinks to a
*separate* app, `apps/forms`, at `forms.gov.bb/forms/<formId>`
(`apps/landing/src/components/markdown/StartLink.tsx:44`). This split means:

- Two apps, two deploys, two analytics surfaces, and a cross-domain hop for
  every citizen who starts a form.
- Content and form are authored and operated separately even though they are one
  service journey.

Rendering the form inside `apps/landing` removes the hop and unifies the
journey.

## Current architecture (as of 2026-07-24)

### `apps/forms` (to be retired)

- Vite + React **SPA**, TanStack Router, **TanStack Form**, Zod + the shared
  `@govtech-bb/form-validation` engine, `@govtech-bb/react` design system,
  Tailwind v4, `@maskito/*` masks.
- Fetches the **resolved contract** at runtime: `GET {VITE_API_URL}/form-definitions/:id`
  (`apps/forms/src/lib/api/forms.ts`), validates with Zod, maps to locale,
  builds `FormMeta`, renders.
- Renderer lives **inside the app**, not in a shared package:
  - `apps/forms/src/components/form-renderer.tsx`
  - `apps/forms/src/components/field-renderer/*`
  - `apps/forms/src/components/review.tsx`,
    `submission-confirmation.tsx`
  - `apps/forms/src/lib/form-builder/*` (build-form, field-mapper,
    validation-builder, behavior-helper, form-fetcher, form-query)
  - `apps/forms/src/hooks/use-step-guard.tsx`
  - `apps/forms/src/lib/session-storage.ts`,
    `apps/forms/src/lib/submission-outcome.ts`
- Submits `POST {VITE_API_URL}/submissions`; files upload via API presign;
  EzPay payment returns via the API.
- State: TanStack Form + `sessionStorage`, step in `?step=` URL param.
- Deployed as its own Amplify app (`amplify.yml:80-125`) at
  `forms.gov.bb` / `forms.sandbox.alpha.gov.bb`.

### `apps/landing` (future host)

- **TanStack Start + Nitro SSR** on Amplify compute (Lambda), file-based
  TanStack Router, client interactivity, dynamic route segments, `?step=`
  search-param support.
- Already ships multi-step stateful wizards (e.g.
  `apps/landing/src/routes/business-trade/crop-over-permits/form.tsx`).
- Content is file-based markdown in `apps/landing/src/content/*.md`, compiled at
  build; front-matter is Zod-validated and already carries
  **`form_id`** (`apps/landing/src/lib/frontmatter.ts:44`). The
  `@govtech-bb/content` package is loader/schema only and reads markdown from
  `apps/landing/src/content` (`packages/content/src/load.ts:18-23`).
- Already fetches the forms API **server-side** via `createServerFn`:
  `/form-definitions` (available forms), `/form-definitions/maintenance`,
  `/form-definitions/closed`, `/service_status`
  (`apps/landing/src/lib/available-forms.ts`,
  `apps/landing/src/lib/service-status.ts`); base URL via
  `apps/landing/src/lib/forms-api-url.ts`.
- Already has `@govtech-bb/react` (same version as forms),
  `@govtech-bb/content`, `@govtech-bb/analytics`, `zod`.
- **Missing** to render a form: `@tanstack/react-form`,
  `@govtech-bb/form-types`, `@govtech-bb/form-conditions`,
  `@govtech-bb/form-validation`, `@maskito/*`, `uuid`, `react-markdown`, and the
  renderer itself.

### API contract source (unchanged by this work)

`GET /form-definitions/:id` resolves a recipe → `ServiceContract` on the server
(`apps/api/src/registry/resolution.ts` `hydrateForm`/`hydrateStep`;
`apps/api/src/forms/form-definitions/form-definitions.service.ts`). This path
also enforces the **authoritative publication/maintenance gate**
(`effectiveVisibility`, `service_status` DB rows, `form_disabled_overrides` kill
switch) and resolves **custom components** from the DB. Landing continues to
consume the already-resolved contract from this endpoint; **no API resolution
changes are in scope.**

## Goal / end state

- `apps/landing` renders every form in-app.
- Canonical form URL is **co-located** with content:
  `gov.bb/<service-path>/form` (e.g.
  `gov.bb/health-and-emergency-services/get-birth-certificate/form`).
- A **generic fallback** route `gov.bb/forms/<formId>` serves forms without a
  content page and acts as the 301 target for old links.
- `apps/forms` and its standalone Amplify app are removed; `forms.gov.bb`
  becomes a 301 redirector.
- One shared renderer (`packages/form-renderer`) — no duplication, no drift.

## Key decisions

1. **Landing is the sole host** (not coexistence long-term). Reaching it still
   passes through a short coexistence window in Phase 1; `apps/forms` is deleted
   in Phase 2 once landing is proven.
2. **Co-located canonical URL + generic fallback (hybrid).** 56 of 75 recipes
   have a content page; 19 are orphans (listed below). Co-located
   `/<service>/form` is canonical when a content page exists; the generic
   `/forms/<formId>` route covers orphans and is the 301 target.
3. **API stays the contract source.** Server-side resolution owns the
   publication gate and custom components; moving it client-side is explicitly
   **out of scope**. (A future "resolve recipes locally for PR previews" idea is
   deferred — see Out of scope.)
4. **Extract to a shared package, don't duplicate.** The renderer moves to
   `packages/form-renderer`, consumed by both `apps/forms` (Phase 0/1) and
   `apps/landing` (Phase 1+).
5. **Transport is injected.** The package must not hard-wire API URLs or
   `fetch`. Hosts supply fetch-contract / submit / file-presign implementations
   so the SSR host (landing) and the SPA host (forms) each provide their own.
6. **The package must be SSR-safe.** No `window` / `sessionStorage` /
   `document` at module top-level or during render — only inside effects — so it
   renders on landing's Lambda. `apps/forms` never needed this (pure SPA); the
   extracted package does.

## Verified constraints

### Form ↔ content-page coverage

- **75** distinct form recipes in `apps/api/src/forms/form-definitions/recipes/`
  (the directory holds 76 `.json` files; the count differs by one
  non-recipe/duplicate — reconcile during Phase 2 orphan triage).
- **56** have a landing content page whose front-matter `form_id` matches.
- **19 orphans** (recipe exists, no content page):
  `application-for-job-letter-ministry-of-education`,
  `apply-for-national-summer-camp-programme`,
  `apply-for-national-summer-camp-programme-tropical-trails-and-tales-science-camp-2026`,
  `chat-feedback`, `digital-media-training-programme-application`,
  `driver-licence-renewal`, `exit-survey`,
  `national-id-application`,
  `pathways-employability-programme-application-2026`,
  `project-dawn-application`, `request-a-fire-service-inspection`,
  `reserve-society-name`, `school-registration-fee`,
  `simple-three-step-form`, `smart-stream-vendor-registration`,
  `ydp-performing-arts-registration-2025-2026`,
  `youth-cultural-training-registration-2025`,
  `youth-leadership-workshop-registration-2026`, `youth-opportunity-ydp`.
- Some orphans are test/utility (`simple-three-step-form`, `exit-survey`,
  `chat-feedback`) and may be excluded from public routing during Phase 2
  triage.

### Cutover dependencies

- **Payment return MUST change.**
  `apps/api/src/payments/payment-return.controller.ts` (`resolveFormsBaseUrl` at
  `:84-93`, `buildConfirmationUrl` at `:95-110`) 302-redirects the citizen after
  EzPay to `${FORMS_BASE_URL}/forms/<formId>/?step=submission-confirmation&payment=success|failed`.
  `FORMS_BASE_URL` is defined at `apps/api/src/config/env.validation.ts:110`
  (falls back to the first `CORS_ORIGIN`). The EzPay merchant return URL points
  at the API endpoint (`/payments/ezpay/redirect`) and does **not** change; only
  the downstream bounce target (base URL + `/forms/<id>/` path shape) must
  repoint to landing's confirmation route.
- **No change needed:** submission/confirmation emails carry no forms URL (only
  S3 presigned file links) (`apps/api/src/forms/submissions/processors/email.processor.ts`);
  `apps/chat` hands off to landing `/start`, not the forms app
  (`apps/chat/src/lib/forms/handoff.ts:22`).
- **Repoint / clean up forms-app URLs:**
  - `apps/landing/src/components/markdown/StartLink.tsx:6-7,44` — main outbound
    link → internal `<Link>`.
  - `apps/feature_flagging/app/lib/service-url.ts:11,28` (`FORMS_URL`) — admin
    catalogue links.
  - Hard-coded `https://forms.gov.bb/CertificateOfCharacter` links in content
    markdown (`apply-to-volunteer-at-a-sports-camp.md`,
    `apply-for-a-position-as-a-temporary-teacher.md`,
    `apply-to-be-a-project-protege-mentor/index.md`,
    `apply-for-conductor-licence/{index,start}.md`,
    `sell-goods-services-beach-park/{index,start}.md`) — stale, point at a
    non-existent formId; review during cutover.
- **Infra:** `apps/forms` is its own Amplify app (`amplify.yml:80-125`) serving
  `forms.gov.bb`. Cutover removes that block and turns the domain into a 301
  redirector (Amplify domain association is managed in the AWS console, outside
  this repo).

## `packages/form-renderer` architecture

A new buildable nx package (`@govtech-bb/form-renderer`) exporting the React
rendering engine and its build pipeline. It depends on `@govtech-bb/form-types`,
`@govtech-bb/form-conditions`, `@govtech-bb/form-validation`,
`@govtech-bb/react`, `@tanstack/react-form`, `@maskito/*`, `uuid`,
`react-markdown`. Per the monorepo rules, it must have a `project.json` with an
`@nx/js:tsc` build target, and any strict-`tsc` consumer must list it in
`references`.

### What moves into the package

From `apps/forms/src`:

- `components/form-renderer.tsx`, `components/field-renderer/*`,
  `components/review.tsx`, `components/submission-confirmation.tsx`
- `lib/form-builder/*` (build-form, field-mapper, validation-builder,
  behavior-helper, and the pure query/fetcher *shapes* — see transport below)
- `hooks/use-step-guard.tsx`
- `lib/session-storage.ts`, `lib/submission-outcome.ts`

### Transport injection (the key interface)

The package must not import `VITE_API_URL` or call `fetch` directly. Define a
transport interface the host supplies (via a prop or React context), roughly:

```ts
export interface FormTransport {
  fetchContract(formId: string, opts?: { preview?: string; draft?: string }): Promise<ClientServiceContract>;
  submit(formId: string, values: SubmissionValues, headers: { idempotencyKey: string }): Promise<SubmissionResponse>;
  presignUpload(file: FileMeta): Promise<PresignResult>;
}
```

- `apps/forms` supplies a `fetch`-based client transport (its current
  `lib/api/forms.ts` logic).
- `apps/landing` supplies a transport whose `fetchContract` runs through its
  existing `createServerFn` SSR path (so the contract is server-rendered), and
  whose `submit`/`presignUpload` call the API from the client as today.

### SSR-safety requirements

- No `window`/`document`/`sessionStorage`/`localStorage` access at module scope
  or during render; gate all of it behind `useEffect` / event handlers.
- `session-storage.ts` helpers must no-op or defer when `typeof window ===
  "undefined"`.
- `uuid`/idempotency-key generation must happen client-side (in an effect or on
  first interaction), not during SSR render.

### Public API (exports)

`FormRenderer` (top-level component taking a `contract` + `transport`), the
`buildForm`/`buildFormMeta` pipeline, the step-guard hook, and the types needed
by hosts. Exact export surface finalised in the Phase 0 plan.

## Phase 0 — Extract `packages/form-renderer`

**Goal:** the renderer lives in a shared package; `apps/forms` consumes it with
**zero behaviour change**.

1. Scaffold `packages/form-renderer` (`project.json` with `@nx/js:tsc` build
   target, `package.json`, `tsconfig` with `composite: true`, references to
   `form-types`/`form-conditions`/`form-validation`).
2. Move the files listed above; convert direct API/`fetch` usage to the injected
   `FormTransport`; make everything SSR-safe.
3. Refactor `apps/forms` to import from `@govtech-bb/form-renderer` and pass a
   `fetch`-based transport. Add the package to `apps/forms/tsconfig`
   `references`.
4. Delete the now-orphaned files from `apps/forms/src` (only those the move
   made unused).

**Verify:** `pnpm exec nx run-many -t build` compiles; `apps/forms` and
`apps/api` unit tests pass; the forms live-smoke / a11y suites pass against the
unchanged `apps/forms`. No user-visible change.

## Phase 1 — Render forms in `apps/landing` (coexistence)

**Goal:** landing renders forms end-to-end; `apps/forms` still runs in parallel.

1. Add deps to `apps/landing`: `@govtech-bb/form-renderer`, `@tanstack/react-form`,
   `@govtech-bb/form-types`, `@govtech-bb/form-conditions`,
   `@govtech-bb/form-validation`, `@maskito/*`, `uuid`, `react-markdown`. Add
   the package to landing's `tsconfig` references.
2. Add a `getFormDefinition(formId)` `createServerFn` (mirrors
   `available-forms.ts`: SSR fetch of `GET /form-definitions/:id`, reuse
   `forms-api-url.ts` + last-known-good caching). Load the contract in the route
   loader so first paint is server-rendered.
3. Provide a landing `FormTransport` (SSR `fetchContract`; client
   `submit`/`presignUpload`).
4. Routing:
   - **Co-located** `/<service-path>/form` — resolve the content slug → its
     front-matter `form_id` → contract. Implemented via the existing catch-all
     route convention (detect a trailing `/form` segment and render the form
     flow instead of content), keeping arbitrary-depth service paths working.
   - **Generic fallback** `/forms/$formId` — for the 19 orphans and as the 301
     target. When a content page exists for the `formId`, this route 302s to the
     canonical co-located URL; otherwise it renders in place.
   - `?step=` drives the wizard via TanStack Router search params.
5. Gate the form route with the data landing already fetches (`/service_status`,
   `/maintenance`, `/closed`) — maintenance / closed / not-public → the
   appropriate existing landing state.
6. Flip `StartLink` from an external hyperlink to an internal `<Link>` to the
   canonical form route.

**Verify:** a form renders and submits from landing (build cert / a paid form
for EzPay); multi-step nav, conditional logic, file upload, and
`sessionStorage` persistence match `apps/forms`; SSR produces no
`window`/`sessionStorage` errors. Run landing + api + forms tests for touched
code.

## Phase 2 — Cutover to sole host (retire `apps/forms`)

**Goal:** landing is the only forms host; `apps/forms` is removed.

1. **Payment return:** repoint `apps/api` `FORMS_BASE_URL` + `buildConfirmationUrl`
   path shape to landing's canonical confirmation route (co-located when known,
   else generic). Verify an end-to-end EzPay round-trip returns to landing.
2. **Repoint remaining links:** `feature_flagging` `FORMS_URL`; fix/remove the
   stale `forms.gov.bb/CertificateOfCharacter` content links.
3. **Redirector:** `forms.gov.bb/forms/<id>` → 301 host-swap →
   `gov.bb/forms/<id>` (generic route), which 302s onward to the canonical
   co-located URL when a content page exists. (Edge redirect / domain
   association in the AWS console.)
4. **Remove infra + app:** delete the `apps/forms` block from `amplify.yml`
   (`:80-125`) and remove the `apps/forms` project.
5. **Tests:** move the forms smoke / a11y suites onto landing form routes;
   update the deploy-sandbox smoke matrix accordingly.
6. **Orphan triage:** decide per orphan formId — give a content page (canonical
   co-located URL) or leave on the generic route; exclude test/utility forms
   (`simple-three-step-form`, `exit-survey`, `chat-feedback`) from public
   routing.

**Verify:** old `forms.gov.bb/forms/<id>` links 301 correctly; EzPay returns to
landing; no remaining references to the forms app URL in shipped code;
`nx run-many -t build` green; smoke matrix green.

## Testing strategy

- **Phase 0** is a pure refactor — the existing `apps/forms` unit tests + smoke
  + a11y are the regression net; they must stay green with no changes to their
  assertions.
- **Phase 1** adds landing-side rendering tests (route resolves content→formId,
  form renders, submit posts the expected `{ formId, values }` shape) and a
  parity check against `apps/forms` for at least one multi-step, one
  conditional, one file-upload, and one paid form.
- **Phase 2** verifies redirects, payment return, and the moved smoke/a11y
  suites.

## Risks & mitigations

- **SSR breakage in the renderer** (biggest Phase 0/1 risk). Mitigate with the
  SSR-safety rules above and an SSR smoke render in CI for a representative form.
- **Payment return misconfig** (citizen stranded after paying). Mitigate by
  testing the full EzPay round-trip in a deployed env before removing
  `apps/forms`, and by keeping `forms.gov.bb` as a redirector so the old
  confirmation path still resolves during the transition.
- **Broken deep-links** on cutover. Mitigate with the host-swap 301 that covers
  all 75 formIds without a lookup table.
- **Orphan forms without a home.** Mitigated by the generic fallback route.

## Out of scope (deferred)

- **Local/build-time recipe resolution** (rendering a form from a bundled recipe
  without a live API) — the original PR-preview idea. Deferred; the shared
  `packages/form-renderer` leaves room to add it later since a resolved contract
  is the only input the renderer needs.
- **Consolidating the two `hydrate` implementations** (`apps/api/src/registry/resolution.ts`
  vs `packages/form-builder/src/resolution.ts`). Not needed while the API remains
  the sole resolver on the render path.
- **Any change to the API resolution / publication-gate / custom-component
  logic.**
