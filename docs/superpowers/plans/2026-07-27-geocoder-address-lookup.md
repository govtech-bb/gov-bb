# Geocoder Address Lookup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Barbados-locked geocoder address-lookup form field type and enable it only on the temporary-restaurant-licence form's event location address.

**Architecture:** A new `address-lookup` `htmlType` that stores a plain **string** value (Option B — the geocoder is a richer input widget over a normal text field, not a new object-valued type). The renderer queries a new `GET /geocode` proxy endpoint on `apps/api`, which calls OpenStreetMap/Nominatim locked to Barbados (`countrycodes=bb`) with a proper `User-Agent`. Selecting a suggestion writes its formatted-address string into the field; the field always accepts free typing, so a provider outage degrades to a plain text box. Because the value is a string, the review screen, submission reshape, email/CMS payloads, and validation all treat it exactly like `text` — no changes there.

**Tech Stack:** TypeScript, Zod (`@govtech-bb/form-types`), NestJS + `@nestjs/axios` (`apps/api`), React + TanStack Form + Vitest/testing-library (`apps/forms`), nx monorepo.

## Global Constraints

- Use **pnpm** for everything, never npm.
- Value stored by `address-lookup` is a `string` (same pipeline as `text`). Do **not** introduce an object value.
- Geocoder is enabled **only** for `event-address-line-1` on `apply-for-temporary-restaurant-licence.json`. Do not touch the applicant address, `event-address-line-2`, or `event-parish` (the latter remains the routing source per #2063).
- Nominatim base URL must be configurable via env (`NOMINATIM_BASE_URL`, default `https://nominatim.openstreetmap.org`) so ops can point at a self-hosted instance without a code change.
- Nominatim usage policy: send a descriptive `User-Agent`, restrict to Barbados (`countrycodes=bb`), `limit=5`. Upstream errors / empty query resolve to `[]` (never throw to the client).
- Recipe edits to an already-published recipe file need the `recipe-version-override` label on the PR (in-place edit of an immutable recipe).
- Build the same way CI does before committing: `pnpm exec nx run-many -t build --exclude=landing`.

---

### Task 1: `form-types` — register the `address-lookup` htmlType

**Files:**
- Modify: `packages/form-types/src/primitive.type.ts`
- Test: `packages/form-types/src/primitive.type.spec.ts` (create if absent) or add to `packages/form-types/src/index.spec.ts`

**Interfaces:**
- Produces: `htmlTypesSchema` enum includes `"address-lookup"`; new `addressLookupPrimitiveSchema` / `AddressLookupPrimitive` (a `basePrimitiveSchema` with `htmlType: z.literal("address-lookup")`); it is a member of the `primitiveSchema` discriminated union so recipes with the field parse.

- [ ] **Step 1: Failing test** — parsing a primitive `{ fieldId, label, htmlType: "address-lookup" }` with `primitiveSchema` succeeds, and `htmlTypesSchema.options` contains `"address-lookup"`.
- [ ] **Step 2: Run it, confirm it fails** (`nx run form-types:test`).
- [ ] **Step 3: Implement** — add `"address-lookup"` to the `z.enum([...])` list; add `addressLookupPrimitiveSchema = basePrimitiveSchema.extend({ htmlType: z.literal("address-lookup") })` + exported `AddressLookupPrimitive` type; add `addressLookupPrimitiveSchema` to the `z.discriminatedUnion("htmlType", [...])` array.
- [ ] **Step 4: Run tests, confirm pass.**
- [ ] **Step 5: Commit** `feat(form-types): add address-lookup htmlType`.

### Task 2: `registry` — `AddressLookup` preset

**Files:**
- Create: `packages/registry/src/components/address-lookup.ts`
- Modify: `packages/registry/src/components/index.ts` (export, add to `ALL`, bump `_componentCount` 49 → 50)
- Test: `packages/registry/src/components/address-lookup.spec.ts` or extend an existing registry spec

**Interfaces:**
- Consumes: `AddressLookupPrimitive` from Task 1.
- Produces: `BUILTIN_REGISTRY["components/address-lookup"]` — an `AddressLookupPrimitive` with `fieldId: "address-lookup"`, `htmlType: "address-lookup"`, and the same `validations` as `Address` (required + minLength 5) so the event address stays required.

- [ ] **Step 1: Failing test** — `BUILTIN_REGISTRY["components/address-lookup"]` exists, `.htmlType === "address-lookup"`, `.validations.required.value === true`.
- [ ] **Step 2: Run it, confirm it fails.**
- [ ] **Step 3: Implement** — create the preset mirroring `components/address.ts` but `htmlType: "address-lookup"` and `fieldId: "address-lookup"`; export `AddressLookup` from `index.ts`, add to `ALL`, bump the `_componentCount` literal.
- [ ] **Step 4: Run tests, confirm pass** (`nx run registry:test`).
- [ ] **Step 5: Commit** `feat(registry): add address-lookup component preset`.

### Task 3: `apps/api` — Barbados-locked geocode proxy

**Files:**
- Create: `apps/api/src/geocode/geocode.service.ts`, `geocode.controller.ts`, `geocode.module.ts`
- Modify: `apps/api/src/app.module.ts` (import `GeocodeModule`)
- Test: `apps/api/src/geocode/geocode.service.spec.ts`

**Interfaces:**
- Produces: `GET /geocode?q=<string>` → `GeocodeResult[]` where `GeocodeResult = { label: string; lat: string; lon: string }`. `GeocodeService.search(q: string): Promise<GeocodeResult[]>`.

- [ ] **Step 1: Failing tests** (mock `HttpService.get`):
  - blank / whitespace `q` → resolves `[]` without any HTTP call;
  - a query calls Nominatim with `countrycodes=bb`, `format=json`, `limit=5`, `addressdetails=1` and a non-empty `User-Agent` header, mapping each result to `{ label: display_name, lat, lon }`;
  - upstream throws / non-2xx → resolves `[]` (no throw).
- [ ] **Step 2: Run, confirm fail** (`nx run api:test`).
- [ ] **Step 3: Implement** — `GeocodeService` injects `HttpService`; base URL from `process.env.NOMINATIM_BASE_URL ?? "https://nominatim.openstreetmap.org"`; `firstValueFrom(this.http.get(...))` with the params/headers above wrapped in try/catch → `[]`; small in-memory `Map` cache keyed by lowercased `q` (cap ~200 entries, TTL ~1h) to respect Nominatim's rate policy. Controller exposes `GET /geocode` reading `@Query("q")`. `GeocodeModule` imports `HttpModule`, provides the service, declares the controller. Register in `app.module.ts`.
- [ ] **Step 4: Run tests, confirm pass.**
- [ ] **Step 5: Commit** `feat(api): Barbados-locked geocode proxy endpoint`.

### Task 4: `apps/forms` — address-lookup field component

**Files:**
- Create: `apps/forms/src/lib/api/geocode.ts` (client for `${VITE_API_URL}/geocode`)
- Create: `apps/forms/src/components/field-renderer/address-lookup-field.tsx`
- Modify: `apps/forms/src/components/field-renderer/index.tsx` (add `case "address-lookup"`)
- Test: `apps/forms/src/components/field-renderer/address-lookup-field.spec.tsx`

**Interfaces:**
- Consumes: `FieldRenderContext` (`field`, `sharedProps`, `requiredProps`, `commitChange`, `invalid`, `hintId`, `errorId`, `errorMessage`, `labelClass`).
- Produces: `renderAddressLookupField(ctx: FieldRenderContext): JSX.Element`; `searchAddresses(q: string, signal?: AbortSignal): Promise<GeocodeResult[]>`.

- [ ] **Step 1: Failing tests** (testing-library + mocked `searchAddresses`):
  - typing ≥3 chars triggers a debounced lookup and renders returned labels as `role="option"`s in a `role="listbox"`;
  - selecting an option calls the field's change handler with that label string and closes the listbox;
  - free typing (no selection) still updates the value;
  - a rejected lookup renders a non-blocking "couldn't load suggestions" note and leaves the input usable (no throw).
- [ ] **Step 2: Run, confirm fail** (`nx run forms:test`).
- [ ] **Step 3: Implement**
  - `geocode.ts`: `searchAddresses` fetches `${import.meta.env.VITE_API_URL ?? "http://localhost:3001"}/geocode?q=`, returns `[]` on non-ok/error.
  - `address-lookup-field.tsx`: text input built from `sharedProps` but with `type="text"` (never spread `type: "address-lookup"` onto the DOM input); WCAG combobox pattern (`role="combobox"`, `aria-expanded`, `aria-controls`, `aria-activedescendant`; listbox `role="listbox"`, options `role="option"`); debounce ~300ms; `AbortController` cancels the in-flight request; ArrowUp/Down/Enter/Escape handling; `onChange` and selection both call `ctx.commitChange(nextString)`; render label/hint/`ErrorMessage` exactly like `text-field.tsx`.
  - `index.tsx`: add `case "address-lookup": return renderAddressLookupField(ctx);`.
- [ ] **Step 4: Run tests, confirm pass.**
- [ ] **Step 5: Commit** `feat(forms): Barbados geocoder address-lookup field`.

### Task 5: recipe — enable geocoder on the event address

**Files:**
- Modify: `apps/api/src/forms/form-definitions/recipes/apply-for-temporary-restaurant-licence.json` (the `event-address-line-1` element only)
- Test: existing recipe/registry resolution tests in `apps/api` cover contract validity.

**Interfaces:**
- Consumes: `components/address-lookup` from Task 2.

- [ ] **Step 1:** Change the `event-address-line-1` element's `"ref": "components/address"` to `"ref": "components/address-lookup"`. Leave its `overrides` (label, fieldId) unchanged. Do not touch `event-address-line-2`, `event-parish`, or the applicant address.
- [ ] **Step 2: Run** `nx run api:test` — recipe resolution + contract validation still pass.
- [ ] **Step 3: Commit** `feat(forms): geocoder on temporary-restaurant event address (#2083)`.

### Task 6: verify + PR

- [ ] **Step 1:** `pnpm exec nx run-many -t test --projects=form-types,registry,api,forms`
- [ ] **Step 2:** `pnpm exec nx run-many -t build --exclude=landing` — all packages compile.
- [ ] **Step 3:** Push branch, open PR against `main` with `Closes #2083`, label `recipe-version-override` (in-place recipe edit) + `enhancement`, `area:frontend`, `subsystem:forms`, `subsystem:api`, `subsystem:packages`.

## Self-Review

- **Spec coverage:** htmlType (T1), renderer (T4), validation (no-op — string empty default, noted), registry preset (T2), provider decision = Nominatim proxied (T3), event-address-only scope (T5), graceful degradation (T3 `[]` + T4 fallback note), build/tests (T6). #2083 AC#2 (structured lat/lon/parish value) is intentionally amended to "stores the selected Barbados address string" per the approved Option B — record this in the PR body.
- **Placeholders:** none.
- **Type consistency:** `AddressLookupPrimitive` (T1) → preset (T2); `GeocodeResult {label,lat,lon}` shared by T3 (produce) and T4 (consume); `renderAddressLookupField` name matches the `case` in T4.
