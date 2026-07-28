# Form `closingDateTime` → "Applications have closed" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let any form recipe declare an optional `meta.closingDateTime`; once that instant passes, citizens see an "Applications have closed" page (with the MDA's contact details) instead of being able to start or submit the form.

**Architecture:** The field is authored at `meta.closingDateTime`, threaded onto the served `ServiceContract` in `hydrateForm`, and enforced in three layers: apps/forms renders a full closed page (bypass-proof for deep-links), the API rejects late submissions, and apps/landing hides "Start now" + shows a closed notice via a new `GET /form-definitions/closed` endpoint (parallel to `/maintenance`). Two shared pure helpers — `isFormClosed` and `formatClosingDateTime` — live in `@govtech-bb/form-types` so every layer agrees on the comparison and the display string.

**Tech Stack:** TypeScript, Zod, NestJS (apps/api), TanStack Start/Router + React (apps/forms, apps/landing), Vitest 4, pnpm + nx.

## Global Constraints

- Use **pnpm** for everything; run tasks via `pnpm exec nx …`. Never `npm`.
- Deadlines are stored as **ISO-8601 with offset** (`dateTimeFormatSchema`); the seed value is `"2026-07-09T23:59:00-04:00"`.
- Display formatting uses timezone **`America/Barbados`** (AST, UTC−04:00, no DST) and the exact string shape `Thursday, 9 July 2026 at 11:59pm` (lowercase am/pm, no space).
- `closingDateTime` is **optional everywhere**; absent → no deadline, behaviour unchanged. Never make it required.
- Vitest uses **globals** (`describe`/`it`/`expect`/`beforeEach` are ambient — do not import them).
- Verify build locally excluding landing's live-API prebuild: `pnpm exec nx run-many -t build --exclude=landing`.
- Match existing file style; surgical changes only.

---

### Task 1: Shared schema + `isFormClosed` / `formatClosingDateTime` helpers (`@govtech-bb/form-types`)

**Files:**
- Modify: `packages/form-types/src/service-contract.type.ts` (add field to `recipeMetaSchema` line 87-89 and `serviceContractSchema` line 45-62)
- Modify: `packages/form-types/src/form-summary.type.ts` (add `closingDateTime?` to `PublicFormSummary`, line 18-35)
- Create: `packages/form-types/src/closing.ts`
- Create: `packages/form-types/src/closing.spec.ts`
- Modify: `packages/form-types/src/index.ts` (export the two helpers)

**Interfaces:**
- Produces:
  - `recipeMetaSchema` / `serviceContractSchema` now carry optional `closingDateTime: DateTimeFormat`.
  - `PublicFormSummary.closingDateTime?: string`.
  - `isFormClosed(closingDateTime: string | undefined, now: Date): boolean` — true iff a deadline is set and `now` is at/after it.
  - `formatClosingDateTime(iso: string): string` → e.g. `"Thursday, 9 July 2026 at 11:59pm"`.

- [ ] **Step 1: Write the failing test** — create `packages/form-types/src/closing.spec.ts`:

```ts
import {
  isFormClosed,
  formatClosingDateTime,
  serviceContractRecipeSchema,
  serviceContractSchema,
} from "./index";

describe("isFormClosed", () => {
  const closing = "2026-07-09T23:59:00-04:00";

  it("is false when no closing date is set", () => {
    expect(isFormClosed(undefined, new Date("2030-01-01T00:00:00Z"))).toBe(
      false,
    );
  });

  it("is false before the closing instant", () => {
    expect(isFormClosed(closing, new Date("2026-07-09T23:58:00-04:00"))).toBe(
      false,
    );
  });

  it("is true at or after the closing instant", () => {
    expect(isFormClosed(closing, new Date("2026-07-09T23:59:00-04:00"))).toBe(
      true,
    );
    expect(isFormClosed(closing, new Date("2026-07-10T00:00:00-04:00"))).toBe(
      true,
    );
  });

  it("is false for an unparseable value", () => {
    expect(isFormClosed("not-a-date", new Date())).toBe(false);
  });
});

describe("formatClosingDateTime", () => {
  it("renders the AST wall-clock in the mockup's shape", () => {
    expect(formatClosingDateTime("2026-07-09T23:59:00-04:00")).toBe(
      "Thursday, 9 July 2026 at 11:59pm",
    );
  });
});

describe("closingDateTime on the schemas", () => {
  const base = {
    formId: "some-form",
    title: "Some form",
    steps: [],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };

  it("accepts meta.closingDateTime on a recipe", () => {
    const parsed = serviceContractRecipeSchema.parse({
      ...base,
      meta: { visibility: "public", closingDateTime: "2026-07-09T23:59:00-04:00" },
    });
    expect(parsed.meta?.closingDateTime).toBe("2026-07-09T23:59:00-04:00");
  });

  it("accepts a recipe with no closingDateTime", () => {
    const parsed = serviceContractRecipeSchema.parse({
      ...base,
      meta: { visibility: "public" },
    });
    expect(parsed.meta?.closingDateTime).toBeUndefined();
  });

  it("carries closingDateTime on the served contract", () => {
    const parsed = serviceContractSchema.parse({
      ...base,
      closingDateTime: "2026-07-09T23:59:00-04:00",
    });
    expect(parsed.closingDateTime).toBe("2026-07-09T23:59:00-04:00");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec nx run form-types:test -- closing`
Expected: FAIL — `isFormClosed`/`formatClosingDateTime` are not exported; schema assertions fail.

- [ ] **Step 3: Add the field to both schemas** — in `packages/form-types/src/service-contract.type.ts`, extend `serviceContractSchema` (after the `version` line, ~line 61) with:

```ts
  // Optional application deadline (#1936). When set and past, citizens see an
  // "Applications have closed" page instead of the form. ISO-8601 with offset;
  // comparison uses the absolute instant, display formats in AST. Rides as a
  // top-level field on the served contract (which has no `meta`).
  closingDateTime: dateTimeFormatSchema.optional(),
```

and extend `recipeMetaSchema` (line 87-89) to:

```ts
export const recipeMetaSchema = z.object({
  visibility: recipeVisibilitySchema.default("preview"),
  // Optional application deadline (#1936). Authored here; hydrateForm lifts it
  // onto the served contract. Absent → the form has no deadline.
  closingDateTime: dateTimeFormatSchema.optional(),
});
```

- [ ] **Step 4: Add `closingDateTime` to `PublicFormSummary`** — in `packages/form-types/src/form-summary.type.ts`, after the `visibility?` field (line 34), add:

```ts
  /**
   * The form's application deadline (#1936), ISO-8601 with offset. Present when
   * the recipe sets `meta.closingDateTime`; used by the API's `/closed`
   * endpoint to decide which public forms have passed their deadline.
   */
  closingDateTime?: string;
```

- [ ] **Step 5: Create the helpers** — create `packages/form-types/src/closing.ts`:

```ts
// Application-deadline helpers (#1936). Single-sourced here so apps/api,
// apps/forms, and apps/landing all agree on when a form is closed and how the
// closing time is displayed.

/**
 * Whether a form's application window has closed. A form with no
 * `closingDateTime` is never closed. Comparison is on the absolute instant, so
 * it is timezone-safe regardless of the offset in the stored string. An
 * unparseable value is treated as "not closed" (fail open — never trap a
 * citizen out of a form because of a malformed date).
 */
export function isFormClosed(
  closingDateTime: string | undefined,
  now: Date,
): boolean {
  if (!closingDateTime) return false;
  const closesAt = new Date(closingDateTime).getTime();
  if (Number.isNaN(closesAt)) return false;
  return now.getTime() >= closesAt;
}

/**
 * Format a closing datetime as e.g. "Thursday, 9 July 2026 at 11:59pm" — the
 * Barbados wall-clock (AST, no DST), lowercase am/pm with no space, matching
 * the "Applications have closed" design.
 */
export function formatClosingDateTime(iso: string): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "America/Barbados",
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).formatToParts(new Date(iso));
  const get = (type: string) =>
    parts.find((p) => p.type === type)?.value ?? "";
  const period = get("dayPeriod").toLowerCase().replace(/\s/g, "");
  return `${get("weekday")}, ${get("day")} ${get("month")} ${get("year")} at ${get("hour")}:${get("minute")}${period}`;
}
```

- [ ] **Step 6: Export the helpers** — in `packages/form-types/src/index.ts`, add (near the other value exports, e.g. after the `deploy-branch` export block):

```ts
export { isFormClosed, formatClosingDateTime } from "./closing";
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `pnpm exec nx run form-types:test -- closing`
Expected: PASS (all cases).

- [ ] **Step 8: Commit**

```bash
git add packages/form-types/src/closing.ts packages/form-types/src/closing.spec.ts packages/form-types/src/service-contract.type.ts packages/form-types/src/form-summary.type.ts packages/form-types/src/index.ts
git commit -m "feat(form-types): optional closingDateTime + isFormClosed/formatClosingDateTime helpers (#1936)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Thread `closingDateTime` through `hydrateForm` (apps/api registry)

**Files:**
- Modify: `apps/api/src/registry/resolution.ts` (`hydrateForm` return, line 106-118)
- Test: `apps/api/src/registry/resolution.spec.ts` (add cases; create if absent)

**Interfaces:**
- Consumes: `recipeMetaSchema.closingDateTime` (Task 1).
- Produces: the served `ServiceContract` returned by `hydrateForm` now carries `closingDateTime` when the recipe's `meta.closingDateTime` is set.

- [ ] **Step 1: Write the failing test** — add to `apps/api/src/registry/resolution.spec.ts` (match the file's existing `hydrateForm` test setup — reuse its resolver/recipe fixture; if the file does not exist, create it modelling an existing registry spec). The essential assertion:

```ts
it("lifts meta.closingDateTime onto the served contract", async () => {
  const recipe = makeRecipe({
    meta: { visibility: "public", closingDateTime: "2026-07-09T23:59:00-04:00" },
  });
  const contract = await hydrateForm(recipe, resolver);
  expect(contract.closingDateTime).toBe("2026-07-09T23:59:00-04:00");
});

it("leaves closingDateTime undefined when the recipe sets none", async () => {
  const recipe = makeRecipe({ meta: { visibility: "public" } });
  const contract = await hydrateForm(recipe, resolver);
  expect(contract.closingDateTime).toBeUndefined();
});
```

(`makeRecipe`/`resolver` = whatever the existing spec uses to build a minimal recipe + resolver. If there is no helper, build a recipe literal with `formId`, `title`, `steps: []`, `createdAt`, `updatedAt`, and a resolver `async () => undefined` — with `steps: []` the resolver is never called.)

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec nx run api:test -- resolution`
Expected: FAIL — `contract.closingDateTime` is `undefined` in the first case.

- [ ] **Step 3: Thread the field** — in `apps/api/src/registry/resolution.ts`, add to the object returned by `hydrateForm` (after `version: recipe.version,`, line 117):

```ts
    // Lift the optional application deadline (#1936) onto the served contract.
    // Like every other field here it is dropped unless explicitly copied.
    closingDateTime: recipe.meta?.closingDateTime,
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm exec nx run api:test -- resolution`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/registry/resolution.ts apps/api/src/registry/resolution.spec.ts
git commit -m "feat(api): hydrateForm lifts meta.closingDateTime onto the served contract (#1936)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: `GET /form-definitions/closed` endpoint (apps/api)

**Files:**
- Modify: `apps/api/src/forms/form-definitions/recipe-file-loader.service.ts` (`findAll`, ~line 214-230 — add `closingDateTime` to each summary)
- Modify: `apps/api/src/forms/form-definitions/form-definitions.service.ts` (`loadDbEntries` line 202-226 — add `closingDateTime`; add `findClosedFormIds()` + private `closedIds()` after `findMaintenanceFormIds`/`maintenanceIds`, line 159-194)
- Modify: `apps/api/src/forms/form-definitions/form-definitions.controller.ts` (add `@Get("closed")` beside `@Get("maintenance")`, line 112-118)
- Test: `apps/api/src/forms/form-definitions/form-definitions.service.spec.ts` (add `findClosedFormIds` cases)

**Interfaces:**
- Consumes: `PublicFormSummary.closingDateTime` (Task 1), `isFormClosed` (Task 1), `effectiveVisibility` (existing).
- Produces: `FormDefinitionsService.findClosedFormIds(now?: Date): Promise<string[]>` — formIds of forms whose *effective* visibility is `public` AND whose `closingDateTime` is at/past `now`. `GET /form-definitions/closed` → `{ status:"success", data: string[] }`.

- [ ] **Step 1: Write the failing test** — add to `apps/api/src/forms/form-definitions/form-definitions.service.spec.ts`, following the existing `findMaintenanceFormIds` test's harness (same mocked `recipeFileLoader.findAll`, `serviceStatusService.list`, `RECIPE_SOURCE=files`). Minimal cases:

```ts
describe("findClosedFormIds", () => {
  const now = new Date("2026-07-10T12:00:00-04:00");

  it("returns public forms whose closingDateTime has passed", async () => {
    recipeFileLoader.findAll.mockReturnValue([
      { formId: "closed-form", title: "A", version: "", visibility: "public", closingDateTime: "2026-07-09T23:59:00-04:00" },
      { formId: "open-form", title: "B", version: "", visibility: "public", closingDateTime: "2030-01-01T00:00:00-04:00" },
      { formId: "no-deadline", title: "C", version: "", visibility: "public" },
    ]);
    serviceStatusService.list.mockResolvedValue([]);
    await expect(service.findClosedFormIds(now)).resolves.toEqual(["closed-form"]);
  });

  it("excludes non-public forms even if their deadline has passed", async () => {
    recipeFileLoader.findAll.mockReturnValue([
      { formId: "hidden", title: "A", version: "", visibility: "preview", closingDateTime: "2026-07-09T23:59:00-04:00" },
    ]);
    serviceStatusService.list.mockResolvedValue([]);
    await expect(service.findClosedFormIds(now)).resolves.toEqual([]);
  });
});
```

(Match the actual mock/instantiation the existing spec uses — reuse its `beforeEach` wiring rather than re-inventing it.)

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec nx run api:test -- form-definitions.service`
Expected: FAIL — `service.findClosedFormIds` is not a function.

- [ ] **Step 3: Populate `closingDateTime` on file summaries** — in `apps/api/src/forms/form-definitions/recipe-file-loader.service.ts` `findAll`, add to the summary object literal (alongside `visibility: getRecipeVisibility(recipe)`):

```ts
        ...(recipe.meta?.closingDateTime && {
          closingDateTime: recipe.meta.closingDateTime,
        }),
```

- [ ] **Step 4: Populate `closingDateTime` on DB summaries** — in `form-definitions.service.ts` `loadDbEntries` (line 211-223), add to the pushed object (alongside `visibility: getRecipeVisibility(entity.schema)`):

```ts
        ...(entity.schema.meta?.closingDateTime && {
          closingDateTime: entity.schema.meta.closingDateTime,
        }),
```

- [ ] **Step 5: Add the service method** — in `form-definitions.service.ts`, import the helper (extend the existing `@govtech-bb/form-types` value import on line 10):

```ts
import { getRecipeVisibility, isFormClosed } from "@govtech-bb/form-types";
```

Add after `maintenanceIds` (line 194), mirroring the maintenance pair:

```ts
  /**
   * Form IDs whose application window has closed (#1936): *public* forms (by
   * effective visibility) with a `closingDateTime` at/past now. Mirrors
   * findMaintenanceFormIds' source dispatch so landing can hide "Start now" and
   * show a closed notice. `now` is injectable for tests; defaults to the current
   * instant.
   */
  async findClosedFormIds(now: Date = new Date()): Promise<string[]> {
    const source = this.source();
    const statusMap = await this.getStatusMap();

    if (source === "files") {
      return this.closedIds(this.recipeFileLoader.findAll(), statusMap, now);
    }

    const dbIds = this.closedIds(await this.loadDbEntries(), statusMap, now);
    if (source === "db") {
      return dbIds;
    }

    return [
      ...new Set([
        ...dbIds,
        ...this.closedIds(this.recipeFileLoader.findAll(), statusMap, now),
      ]),
    ];
  }

  private closedIds(
    entries: PublicFormSummary[],
    statusMap: Map<string, ServiceStatus>,
    now: Date,
  ): string[] {
    return entries
      .filter(
        (e) =>
          effectiveVisibility(
            e.visibility ?? "preview",
            statusMap.get(e.formId),
          ) === "public" && isFormClosed(e.closingDateTime, now),
      )
      .map((e) => e.formId);
  }
```

- [ ] **Step 6: Add the controller route** — in `form-definitions.controller.ts`, immediately after `getMaintenance` (line 118), add:

```ts
  // Declared before `:formId` (like "maintenance") so it routes here. Public:
  // the closed formIds let landing hide "Start now" and show a closed notice
  // (#1936). Closed forms stay public/served — the closed page needs the
  // contract's contactDetails — so this list is purely advisory to landing.
  @Get("closed")
  async getClosed(): Promise<ApiResponseShape<string[]>> {
    const formIds = await this.formDefinitionsService.findClosedFormIds();
    return AppApiResponse.success(formIds, {
      message: "Closed forms retrieved",
    });
  }
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `pnpm exec nx run api:test -- form-definitions`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/forms/form-definitions/recipe-file-loader.service.ts apps/api/src/forms/form-definitions/form-definitions.service.ts apps/api/src/forms/form-definitions/form-definitions.controller.ts apps/api/src/forms/form-definitions/form-definitions.service.spec.ts
git commit -m "feat(api): GET /form-definitions/closed lists public past-deadline forms (#1936)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: Reject late submissions server-side (apps/api submissions)

**Files:**
- Modify: `apps/api/src/forms/submissions/submissions.service.ts` (`submit`, after `pipeline.run` line 53-54)
- Test: `apps/api/src/forms/submissions/submissions.service.spec.ts` (add guard cases)

**Interfaces:**
- Consumes: `contract.closingDateTime` (Task 2, present on the resolved `ServiceContract`), `isFormClosed` (Task 1), `AppError.badRequest` (existing), `dto.isSmokeSubmission` (existing).
- Produces: `submit()` throws `AppError.badRequest("Applications for this form have closed")` for a real submission received after the deadline; smoke submissions and open/undeadlined forms proceed.

- [ ] **Step 1: Write the failing test** — add to `apps/api/src/forms/submissions/submissions.service.spec.ts`, reusing the existing harness that mocks `pipeline.run`. Cases:

```ts
it("rejects a submission after the form's closing datetime", async () => {
  pipeline.run.mockResolvedValue({
    draft: null,
    contract: { ...baseContract, closingDateTime: "2020-01-01T00:00:00-04:00" },
    auditTrail: {},
    normalizedValues: {},
  });
  await expect(
    service.submit({ ...baseDto, idempotencyKey: "k1" }),
  ).rejects.toThrow("Applications for this form have closed");
});

it("allows a submission before the closing datetime", async () => {
  pipeline.run.mockResolvedValue({
    draft: null,
    contract: { ...baseContract, closingDateTime: "2999-01-01T00:00:00-04:00" },
    auditTrail: {},
    normalizedValues: {},
  });
  await expect(
    service.submit({ ...baseDto, idempotencyKey: "k2" }),
  ).resolves.toBeDefined();
});

it("allows a smoke submission even after the closing datetime", async () => {
  pipeline.run.mockResolvedValue({
    draft: null,
    contract: { ...baseContract, closingDateTime: "2020-01-01T00:00:00-04:00" },
    auditTrail: {},
    normalizedValues: {},
  });
  await expect(
    service.submit({ ...baseDto, idempotencyKey: "k3", isSmokeSubmission: true }),
  ).resolves.toBeDefined();
});
```

(`baseContract`/`baseDto` = the minimal contract + SubmitDto the existing spec already builds; extend those rather than re-declaring. Ensure `submissionRepo.findOne` is mocked to return `null` so the idempotency short-circuit doesn't fire, and the save/emit path is mocked as the existing passing tests do.)

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec nx run api:test -- submissions.service`
Expected: FAIL — the first case resolves instead of throwing.

- [ ] **Step 3: Add the guard** — in `submissions.service.ts`, import the helper (add to the existing `@govtech-bb/form-types` import, or add a new import line if none):

```ts
import { isFormClosed } from "@govtech-bb/form-types";
```

Then, immediately after the pipeline line (`const { draft, contract, auditTrail, normalizedValues } = await this.pipeline.run(dto);`, ~line 54), insert:

```ts
    // #1936: reject a submission whose form has closed. The UI gates this too,
    // but a direct POST would otherwise slip through. Smoke submissions bypass
    // so the live-smoke gate is never blocked by a form's deadline.
    if (!dto.isSmokeSubmission && isFormClosed(contract.closingDateTime, new Date())) {
      throw AppError.badRequest("Applications for this form have closed");
    }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm exec nx run api:test -- submissions.service`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/forms/submissions/submissions.service.ts apps/api/src/forms/submissions/submissions.service.spec.ts
git commit -m "feat(api): reject submissions received after a form's closingDateTime (#1936)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: Forms app renders the "Applications have closed" page

**Files:**
- Modify: `apps/forms/src/types/field-mapper.type.ts` (`ClientServiceContract`, line 50-58 — add `closingDateTime?`)
- Modify: `apps/forms/src/types/renderer.type.ts` (`FormMeta`, line 10-22 — add `closingDateTime?`)
- Modify: `apps/forms/src/lib/form-builder/build-form.ts` (FormMeta return, line 58-69 — carry `closingDateTime`)
- Create: `apps/forms/src/components/application-closed.tsx`
- Modify: `apps/forms/src/components/index.ts` (export `ApplicationClosed`)
- Modify: `apps/forms/src/routes/forms/$formId/index.tsx` (`RouteComponent`, branch to closed page)
- Test: `apps/forms/src/components/application-closed.spec.tsx` (create)

**Interfaces:**
- Consumes: `ServiceContract.closingDateTime` (spread through `mapContractToLocale`, which does `...contract` — no change needed there), `formatClosingDateTime` + `isFormClosed` (Task 1), `ContactDetails` (existing).
- Produces: `<ApplicationClosed serviceTitle contactDetails closingDateTime />`; `FormMeta.closingDateTime?: DateTimeFormat`.

- [ ] **Step 1: Write the failing test** — create `apps/forms/src/components/application-closed.spec.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import ApplicationClosed from "./application-closed";

describe("ApplicationClosed", () => {
  it("shows the service title, formatted deadline, and MDA contact", () => {
    render(
      <ApplicationClosed
        serviceTitle="National Science Camp 2026"
        closingDateTime="2026-07-09T23:59:00-04:00"
        contactDetails={{
          title: "Ministry of Education",
          email: "camp@example.gov.bb",
          telephoneNumber: "246-555-0100",
        }}
      />,
    );
    expect(
      screen.getByRole("heading", {
        name: /Applications for National Science Camp 2026 have closed/i,
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Thursday, 9 July 2026 at 11:59pm"),
    ).toBeInTheDocument();
    expect(screen.getByText("camp@example.gov.bb")).toBeInTheDocument();
    expect(screen.getByText("246-555-0100")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec nx run forms:test -- application-closed`
Expected: FAIL — module `./application-closed` does not exist.

- [ ] **Step 3: Create the component** — create `apps/forms/src/components/application-closed.tsx`. It mirrors the mockup, reuses the design-system `Heading`/`Text` (like `error-page.tsx`) and the `form-page__contact` markup pattern from `submission-confirmation.tsx`:

```tsx
import { Heading, Text } from "@govtech-bb/react";
import { ContactDetails, formatClosingDateTime } from "@govtech-bb/form-types";

interface ApplicationClosedProps {
  serviceTitle: string;
  closingDateTime: string;
  contactDetails?: ContactDetails;
}

export default function ApplicationClosed({
  serviceTitle,
  closingDateTime,
  contactDetails,
}: ApplicationClosedProps) {
  return (
    <div className="container py-8 lg:py-16">
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2 lg:space-y-8">
          <Heading as="h1">
            Applications for {serviceTitle} have closed
          </Heading>
          <Text as="p">The application window has closed.</Text>

          <div className="form-page__contact">
            <p>
              <span className="form-page__contact-label">
                Application closed
              </span>
            </p>
            <p>{formatClosingDateTime(closingDateTime)}</p>
          </div>

          {contactDetails && (
            <div className="form-page__contact">
              <p>
                If you have a question about this service, contact:
              </p>
              {contactDetails.title && (
                <h3 className="govbb-text-h3">{contactDetails.title}</h3>
              )}
              <div className="form-page__contact-body">
                {contactDetails.telephoneNumber && (
                  <p>
                    <span className="form-page__contact-label">Telephone:</span>{" "}
                    {contactDetails.telephoneNumber}
                  </p>
                )}
                {contactDetails.email && (
                  <p>
                    <span className="form-page__contact-label">Email:</span>{" "}
                    {contactDetails.email}
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Export it** — in `apps/forms/src/components/index.ts`:

```ts
import FormRenderer from "./form-renderer";
import NotFound from "./not-found";
import FormError from "./form-error";
import ApplicationClosed from "./application-closed";

export { FormRenderer, NotFound, FormError, ApplicationClosed };
```

- [ ] **Step 5: Run the component test to verify it passes**

Run: `pnpm exec nx run forms:test -- application-closed`
Expected: PASS.

- [ ] **Step 6: Thread `closingDateTime` into the types + FormMeta** —
  - `apps/forms/src/types/field-mapper.type.ts` `ClientServiceContract`: add after `contactDetails?` (line 54):

```ts
  closingDateTime?: DateTimeFormat;
```

  (`DateTimeFormat` is already imported at the top of this file.)

  - `apps/forms/src/types/renderer.type.ts` `FormMeta`: add after `contactDetails?` (line 15):

```ts
  /** Application deadline (#1936); when past, the closed page is shown. */
  closingDateTime?: string;
```

  - `apps/forms/src/lib/form-builder/build-form.ts` FormMeta return: add after `contactDetails: contract.contactDetails,` (line 62):

```ts
    closingDateTime: contract.closingDateTime,
```

- [ ] **Step 7: Branch the route to the closed page** — in `apps/forms/src/routes/forms/$formId/index.tsx`:
  - Add `ApplicationClosed` to the `@forms/components` import (line 11): `import { FormRenderer, FormError, ApplicationClosed } from "@forms/components";`
  - Add `isFormClosed` import: `import { isFormClosed } from "@govtech-bb/form-types";`
  - At the top of `RouteComponent` (after `const formMeta = Route.useLoaderData();`, line 106), add the branch:

```tsx
  // #1936: a form past its closing datetime shows the closed page instead of the
  // renderer. Previewing an unpublished recipe (?preview=) bypasses the gate so
  // an operator can still review a closed form.
  if (!preview && isFormClosed(formMeta.closingDateTime, new Date())) {
    return (
      <ApplicationClosed
        serviceTitle={formMeta.formTitle}
        closingDateTime={formMeta.closingDateTime!}
        contactDetails={formMeta.contactDetails}
      />
    );
  }
```

  Note: `preview` is already destructured from `Route.useSearch()` on line 107 — move that destructuring above the branch, or read `Route.useSearch()` for `preview` before the guard. Concretely, reorder so `const { step, preview, draft, source, payment } = Route.useSearch();` (line 107) sits directly under line 106, before the new `if`.

- [ ] **Step 8: Run the forms test suite to verify nothing regressed**

Run: `pnpm exec nx run forms:test`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add apps/forms/src/components/application-closed.tsx apps/forms/src/components/application-closed.spec.tsx apps/forms/src/components/index.ts apps/forms/src/types/field-mapper.type.ts apps/forms/src/types/renderer.type.ts apps/forms/src/lib/form-builder/build-form.ts apps/forms/src/routes/forms/\$formId/index.tsx
git commit -m "feat(forms): render Applications-closed page past a form's closingDateTime (#1936)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 6: Landing hides "Start now" + shows a closed notice

**Files:**
- Modify: `apps/landing/src/lib/available-forms.ts` (add `fetchClosedFormIds`, `closedCache`, `resolveClosedFromModuleCache`, `getClosedForms`)
- Create: `apps/landing/src/components/ApplicationClosedNotice.tsx`
- Modify: `apps/landing/src/routes/$.tsx` (loader computes `applicationClosed` + strips the formId from `availableForms`; `PageView` renders the notice)
- Test: `apps/landing/src/lib/available-forms.spec.ts` (add a `getClosedForms`/parse case, matching the existing maintenance test)

**Interfaces:**
- Consumes: the `GET /form-definitions/closed` endpoint (Task 3), existing `resolveAvailableForms`, `parseMaintenanceIds` (bare-id-array parser, reused), `shouldHideStartLink` (existing).
- Produces: `getClosedForms(): Promise<string[]>` server fn; `<ApplicationClosedNotice />`; loader field `applicationClosed: boolean`.

- [ ] **Step 1: Write the failing test** — add to `apps/landing/src/lib/available-forms.spec.ts`, mirroring the maintenance-fetch test already there. If maintenance is tested via `resolveAvailableForms` with an injected fetcher, replicate that; the essential new assertion is that `getClosedForms` is exported and returns the parsed ids. Minimal parse-level case (parser is shared with maintenance, so this mainly locks the wiring):

```ts
it("getClosedForms is exported and returns an array", async () => {
  const { getClosedForms } = await import("./available-forms");
  expect(typeof getClosedForms).toBe("function");
});
```

(If the existing maintenance test injects a fetcher into `resolveAvailableForms`, add a parallel closed case with `data: ["closed-form"]` asserting `["closed-form"]`.)

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec nx run landing:test -- available-forms`
Expected: FAIL — `getClosedForms` is not exported.

- [ ] **Step 3: Add the closed fetcher + server fn** — in `apps/landing/src/lib/available-forms.ts`:
  - After `fetchMaintenanceFormIds` (line 151), add:

```ts
/** Fetch and validate the IDs of forms whose application window has closed (#1936). */
async function fetchClosedFormIds(): Promise<string[]> {
  const response = await fetchWithTimeout(
    `${formsApiBase()}/form-definitions/closed`,
    FETCH_TIMEOUT_MS,
  )
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} ${response.statusText}`)
  }
  // Same bare `{status,data:[ids]}` shape as /maintenance.
  return parseMaintenanceIds(await response.json())
}
```

  - After `getMaintenanceForms` (line 252), add:

```ts
/** Per-instance cache for the closed-forms list, separate from the others. */
const closedCache: CacheRef = { current: null }

/** Resolve the closed-forms list through its own per-instance cache. */
function resolveClosedFromModuleCache(): Promise<string[]> {
  return resolveAvailableForms({
    now: Date.now(),
    ttlMs: TTL_MS,
    fetcher: fetchClosedFormIds,
    cache: closedCache,
    coldStartRetries: COLD_START_RETRIES,
  })
}

/**
 * Server function returning the IDs of forms whose application window has closed
 * (#1936), backed by its own per-instance cache. A failed fetch degrades safely
 * to `[]` — the closed notice is suppressed and the Start button stays as-is.
 */
export const getClosedForms = createServerFn().handler(
  async (): Promise<string[]> => resolveClosedFromModuleCache(),
)
```

- [ ] **Step 4: Create the notice** — create `apps/landing/src/components/ApplicationClosedNotice.tsx`:

```tsx
import { StatusBanner, Text } from '@govtech-bb/react'

/**
 * Shown on a service page whose form's application window has closed (#1936).
 * The form's "Start now" method is hidden alongside it. The full dated
 * "Applications have closed" page lives in apps/forms.
 */
export function ApplicationClosedNotice() {
  return (
    <StatusBanner variant="service-issue">
      <Text as="p">
        Applications for this service have closed.
      </Text>
    </StatusBanner>
  )
}
```

- [ ] **Step 5: Wire the loader + view** — in `apps/landing/src/routes/$.tsx`:
  - Import: extend line 20 to `import { getAvailableForms, getMaintenanceForms, getClosedForms } from '../lib/available-forms'` and add `import { ApplicationClosedNotice } from '../components/ApplicationClosedNotice'` near line 6.
  - In the loader's page branch, after `underMaintenance` is computed (line 142-144), add:

```ts
      // #1936: a public form past its closing datetime hides its Start button
      // (like maintenance) and renders the closed notice. Closed forms stay
      // public, so — unlike maintenance — they ARE in availableForms; strip the
      // formId here so shouldHideStartLink hides the CTA and the /start sub-page
      // 404s by direct URL.
      const applicationClosed =
        formId !== undefined && (await getClosedForms()).includes(formId)
      if (applicationClosed) {
        availableForms = availableForms.filter((f) => f !== formId)
      }
```

  Ensure this runs **before** the `/start` sub-page `notFound()` check on line 131-137 so a direct `/start` link on a closed form 404s. Concretely, move the `applicationClosed` computation + filter to just after line 126 (the `formDisabledByStatus` filter) and before the `/start` block. `underMaintenance` stays where it is.
  - Add `applicationClosed` to the returned page object (line 145-152): `applicationClosed,`.
  - Add it to the loader return type block (line 52 area, beside `underMaintenance: boolean`): `applicationClosed: boolean`.
  - Pass it to `PageView` in `ContentRoute` (line 221-227): `applicationClosed={data.applicationClosed}`.
  - Add it to `PageView`'s destructured props (line 249-262) and its prop type: `applicationClosed: boolean`.
  - Render it in `PageView`'s JSX after the maintenance line (line 286):

```tsx
      {applicationClosed ? <ApplicationClosedNotice /> : null}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `pnpm exec nx run landing:test`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/landing/src/lib/available-forms.ts apps/landing/src/lib/available-forms.spec.ts apps/landing/src/components/ApplicationClosedNotice.tsx apps/landing/src/routes/\$.tsx
git commit -m "feat(landing): hide Start-now + show closed notice for past-deadline forms (#1936)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 7: Seed the summer-camp 2026 deadline + full verification

**Files:**
- Modify: `apps/api/src/forms/form-definitions/recipes/apply-for-national-summer-camp-programme-tropical-trails-and-tales-science-camp-2026.json` (`meta`, line 1285-1287)

**Interfaces:**
- Consumes: the `meta.closingDateTime` schema field (Task 1).

- [ ] **Step 1: Add the closing datetime to the recipe** — change the recipe's `meta` block from:

```json
  "meta": {
    "visibility": "public"
  }
```

to:

```json
  "meta": {
    "visibility": "public",
    "closingDateTime": "2026-07-09T23:59:00-04:00"
  }
```

- [ ] **Step 2: Verify the recipe still validates + api tests pass**

Run: `pnpm exec nx run api:test`
Expected: PASS (recipe-loading/validation tests included).

- [ ] **Step 3: Full build (excluding landing's live-API prebuild)**

Run: `pnpm exec nx run-many -t build --exclude=landing`
Expected: all packages compile, no TS errors.

- [ ] **Step 4: Full test sweep for touched projects**

Run: `pnpm exec nx run-many -t test --projects=form-types,api,forms,landing`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/forms/form-definitions/recipes/apply-for-national-summer-camp-programme-tropical-trails-and-tales-science-camp-2026.json
git commit -m "feat(forms): close National Science Camp 2026 applications 9 Jul 2026 23:59 AST (#1936)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

- [ ] **Step 6: Visual check (verify skill / /run)** — start apps/forms locally, set the seed recipe's `closingDateTime` in the past (or rely on the 9 Jul 2026 value, which is past "today"), navigate to `/forms/apply-for-national-summer-camp-programme-tropical-trails-and-tales-science-camp-2026`, and confirm the closed page renders with the formatted date and MDA contact. Screenshot for the PR.

---

## Notes for the implementer

- `mapContractToLocale` (`apps/forms/src/lib/form-builder/field-mapper.ts`) spreads `...contract`, so `closingDateTime` flows from `ServiceContract` → `ClientServiceContract` automatically once the type carries it — no mapping code to add there, but the `ClientServiceContract` type MUST include the field (Task 5 Step 6) or `build-form.ts`'s `contract.closingDateTime` won't type-check.
- The forms client re-parses the API body with `serviceContractSchema.parse` (`apps/forms/src/lib/api/forms.ts:118`); since Task 1 added `closingDateTime` to that schema, the field survives the parse rather than being stripped.
- Landing reuses `parseMaintenanceIds` for the `/closed` payload because both endpoints return the identical `{status:"success", data:[ids]}` bare-array shape. Do not add a redundant parser.
- Keep the seed's offset as `-04:00` (AST). Do not use `Z`/UTC — the intent is the Barbados wall-clock 11:59pm.
```
