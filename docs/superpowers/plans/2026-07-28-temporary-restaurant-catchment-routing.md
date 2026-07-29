# Coordinate-based Catchment Routing — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Route the temporary-restaurant-licence webhook `programme_code` and the MDA-notification email recipient to the polyclinic that serves the event location, resolved per-submission from the event coordinates (point-in-polygon over 8 catchment polygons) with a parish fallback.

**Architecture:** A new `CatchmentRoutingService` (apps/api) loads a checked-in WGS84 GeoJSON of the 8 polyclinic catchments (reused verbatim from the newforms prototype) plus a TS constants module (`PROGRAMME_CODES`, `PARISH_DEFAULTS`). At submission time — before processor dispatch, where the resolved contract and submitted values coexist — `submissions.service` resolves the catchment once and attaches a `resolvedCatchment` object to the `submission.created` event. It rides the event through the SQS hop; the webhook processor reads `programmeCode` from it and the email processor resolves a new `catchment.mdaEmail` recipient token from it.

**Tech Stack:** NestJS (apps/api), Zod (packages/form-types), TypeScript project-references monorepo (nx + `@nx/js:tsc`), Vitest 4, pnpm.

## Global Constraints

- Use **pnpm** for everything, never npm.
- Build all packages before committing: `pnpm exec nx run-many -t build --exclude=landing` (landing's prebuild needs a live API — let CI build it).
- Run the tests for what you touch: `pnpm exec nx run <project>:test` (each project ~30s). Projects touched here: `form-types`, `form-builder`, `api`.
- apps/api tests transform with swc (`unplugin-swc`) — do not change its `vitest.config.ts`.
- New/edited recipe fields: generic primitives default `required: true`; optional fields must set `validations.required.value: false`. (Not exercised here — no new form fields — but keep in mind for the recipe edit.)
- A resolved-time Zod schema **strips unknown keys**. Any config/contract field that must survive to a processor has to be declared in the *resolved* schema, or lifted explicitly in `hydrateForm`.
- GeoJSON coordinates are `[lng, lat]`; the `event-address-coordinates` field stores `"lat,lon"`. Never conflate the two.
- Commit after each task with the `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>` trailer. Branch is `add-cya-step-temp-restaurant-licence` (already off `main`) — stay on it.

---

## File Structure

**Create:**
- `apps/api/src/catchment/polyclinic-catchments.geojson` — 8 WGS84 catchment features (geometry + `name`/`email` props), from the prototype.
- `apps/api/src/catchment/polyclinic-routing.ts` — `PROGRAMME_CODES`, `PARISH_DEFAULTS` constants.
- `apps/api/src/catchment/catchment-routing.service.ts` — `CatchmentRoutingService`, `CatchmentResolution`, point-in-polygon.
- `apps/api/src/catchment/catchment-routing.service.spec.ts` — service tests.
- `apps/api/src/catchment/catchment.module.ts` — provides + exports the service.

**Modify:**
- `packages/form-types/src/service-contract.type.ts` — add optional `catchmentRouting` to recipe + served schemas.
- `packages/form-types/src/recipient-field.ts` — add `catchment` recipient kind.
- `packages/form-builder/src/resolution.ts` — pass `catchmentRouting` through `hydrateForm`.
- `apps/api/project.json` — asset glob for the GeoJSON.
- `apps/api/src/forms/submissions/submissions.types.ts` — add `resolvedCatchment?` to `SubmissionCreatedEvent`.
- `apps/api/src/forms/submissions/sqs/submission-sqs-message.interface.ts` — add `resolvedCatchment?`.
- `apps/api/src/forms/submissions/sqs/sqs-producer.service.ts` — copy `resolvedCatchment` onto the message.
- `apps/api/src/forms/submissions/sqs/sqs-consumer.service.ts` — copy it back in `toEvent`.
- `apps/api/src/forms/submissions/submissions.service.ts` — inject the service, resolve, attach to the event.
- `apps/api/src/forms/submissions/submissions.module.ts` — import `CatchmentModule`.
- `apps/api/src/forms/submissions/processors/webhook-mapping.ts` — `programmeCodeOverride` arg.
- `apps/api/src/forms/submissions/processors/webhook.processor.ts` — pass the override.
- `apps/api/src/forms/submissions/processors/email.processor.ts` — `catchment` recipient branch.
- `apps/api/src/forms/form-definitions/recipes/apply-for-temporary-restaurant-licence.json` — add `catchmentRouting`, switch MDA `recipientField`.
- `apps/api/src/forms/form-definitions/form-definitions.service.ts` — strip `catchmentRouting` from the public client contract.

---

## Task 1: `catchmentRouting` schema on the contract types

**Files:**
- Modify: `packages/form-types/src/service-contract.type.ts`
- Test: `packages/form-types/src/service-contract.type.spec.ts` (create if absent; otherwise append)

**Interfaces:**
- Produces: `catchmentRoutingSchema` and `CatchmentRouting` type; optional `catchmentRouting` on both `serviceContractRecipeSchema` and `serviceContractSchema`.

- [ ] **Step 1: Write the failing test**

Append to `packages/form-types/src/service-contract.type.spec.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  serviceContractRecipeSchema,
  serviceContractSchema,
} from "./service-contract.type";

const RECIPE_BASE = {
  formId: "f",
  title: "T",
  steps: [],
  createdAt: "2026-07-28T00:00:00Z",
  updatedAt: "2026-07-28T00:00:00Z",
};

describe("catchmentRouting", () => {
  it("accepts a catchmentRouting block on the recipe schema", () => {
    const parsed = serviceContractRecipeSchema.parse({
      ...RECIPE_BASE,
      catchmentRouting: {
        coordinatesField: "event-details.event-address-coordinates",
        parishField: "event-details.event-parish",
      },
    });
    expect(parsed.catchmentRouting?.parishField).toBe(
      "event-details.event-parish",
    );
  });

  it("is optional (absent parses)", () => {
    expect(
      serviceContractRecipeSchema.parse(RECIPE_BASE).catchmentRouting,
    ).toBeUndefined();
  });

  it("rejects a block missing coordinatesField", () => {
    expect(
      serviceContractRecipeSchema.safeParse({
        ...RECIPE_BASE,
        catchmentRouting: { parishField: "a.b" },
      }).success,
    ).toBe(false);
  });

  it("carries catchmentRouting on the served contract schema", () => {
    const parsed = serviceContractSchema.parse({
      formId: "f",
      title: "T",
      steps: [],
      createdAt: "2026-07-28T00:00:00Z",
      updatedAt: "2026-07-28T00:00:00Z",
      catchmentRouting: {
        coordinatesField: "s.coords",
        parishField: "s.parish",
      },
    });
    expect(parsed.catchmentRouting?.coordinatesField).toBe("s.coords");
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `pnpm exec nx run form-types:test`
Expected: FAIL — `catchmentRouting` not defined on the schema / property missing.

- [ ] **Step 3: Add the schema**

In `packages/form-types/src/service-contract.type.ts`, before `serviceContractSchema`:

```ts
/**
 * Coordinate-based catchment routing (#temp-restaurant). Names the submitted
 * fields the server reads to route a submission to the polyclinic serving the
 * event location: `coordinatesField` holds a "lat,lon" string, `parishField`
 * the parish fallback. Both are "stepId.fieldId" paths. Server-side only —
 * inert if leaked, but stripped from the public contract.
 */
export const catchmentRoutingSchema = z.object({
  coordinatesField: z.string().min(1),
  parishField: z.string().min(1),
});
export type CatchmentRouting = z.infer<typeof catchmentRoutingSchema>;
```

Then add this line inside **both** `serviceContractSchema` (after `closingDateTime`) and `serviceContractRecipeSchema` (after `version`):

```ts
  catchmentRouting: catchmentRoutingSchema.optional(),
```

- [ ] **Step 4: Run tests to confirm pass**

Run: `pnpm exec nx run form-types:test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/form-types/src/service-contract.type.ts packages/form-types/src/service-contract.type.spec.ts
git commit -m "feat(form-types): add optional catchmentRouting to contract schemas

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: `catchment` recipient kind

**Files:**
- Modify: `packages/form-types/src/recipient-field.ts`
- Test: `packages/form-types/src/recipient-field.spec.ts` (create if absent; otherwise append)

**Interfaces:**
- Produces: `RecipientKind` gains `"catchment"`; `CATCHMENT_RECIPIENT_PREFIX = "catchment."`; `classifyRecipientField("catchment.mdaEmail") === "catchment"`.

- [ ] **Step 1: Write the failing test**

Append to `packages/form-types/src/recipient-field.spec.ts`:

```ts
import { describe, expect, it } from "vitest";
import { classifyRecipientField } from "./recipient-field";

describe("classifyRecipientField — catchment", () => {
  it("classifies the catchment token", () => {
    expect(classifyRecipientField("catchment.mdaEmail")).toBe("catchment");
  });
  it("still classifies config, literal, submitted", () => {
    expect(classifyRecipientField("config.mdaEmail")).toBe("config");
    expect(classifyRecipientField("a@b.com")).toBe("literal");
    expect(classifyRecipientField("step.field")).toBe("submitted");
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `pnpm exec nx run form-types:test`
Expected: FAIL — returns `"submitted"` for `catchment.mdaEmail`.

- [ ] **Step 3: Implement**

In `packages/form-types/src/recipient-field.ts`:

Change the type:
```ts
export type RecipientKind =
  | "literal"
  | "contact"
  | "config"
  | "catchment"
  | "submitted";
```

Add the prefix constant next to `CONFIG_RECIPIENT_PREFIX`:
```ts
/** Prefix marking a recipient routed to the event's polyclinic catchment. */
export const CATCHMENT_RECIPIENT_PREFIX = "catchment.";
```

Add the classify branch (after the `config` check, before the `submitted` fallthrough):
```ts
  if (recipientField.startsWith(CATCHMENT_RECIPIENT_PREFIX)) return "catchment";
```

- [ ] **Step 4: Run tests to confirm pass**

Run: `pnpm exec nx run form-types:test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/form-types/src/recipient-field.ts packages/form-types/src/recipient-field.spec.ts
git commit -m "feat(form-types): add catchment recipient kind

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: Pass `catchmentRouting` through `hydrateForm`

**Files:**
- Modify: `packages/form-builder/src/resolution.ts:97-114`
- Test: `packages/form-builder/src/resolution.spec.ts` (append)

**Interfaces:**
- Consumes: `ServiceContractRecipe.catchmentRouting` (Task 1).
- Produces: `hydrateForm(recipe, catalog).catchmentRouting` present iff the recipe declared it.

- [ ] **Step 1: Write the failing test**

Append to `packages/form-builder/src/resolution.spec.ts` (reuse whatever minimal recipe + catalog helper the file already uses; if none, construct a recipe with `steps: []` and an empty catalog `{}`):

```ts
it("carries catchmentRouting through to the served contract", () => {
  const recipe = {
    formId: "f",
    title: "T",
    steps: [],
    createdAt: "2026-07-28T00:00:00Z",
    updatedAt: "2026-07-28T00:00:00Z",
    catchmentRouting: {
      coordinatesField: "event-details.event-address-coordinates",
      parishField: "event-details.event-parish",
    },
  };
  const contract = hydrateForm(recipe as never, {} as never);
  expect(contract.catchmentRouting?.parishField).toBe(
    "event-details.event-parish",
  );
});

it("omits catchmentRouting when the recipe has none", () => {
  const recipe = {
    formId: "f",
    title: "T",
    steps: [],
    createdAt: "2026-07-28T00:00:00Z",
    updatedAt: "2026-07-28T00:00:00Z",
  };
  expect(hydrateForm(recipe as never, {} as never).catchmentRouting).toBeUndefined();
});
```

(Ensure `hydrateForm` is imported at the top of the spec.)

- [ ] **Step 2: Run it and confirm it fails**

Run: `pnpm exec nx run form-builder:test`
Expected: FAIL — `catchmentRouting` is undefined on the returned contract.

- [ ] **Step 3: Implement**

In `packages/form-builder/src/resolution.ts`, inside the `return { … }` of `hydrateForm` (after the `processors` spread, before `createdAt`):

```ts
    ...(recipe.catchmentRouting !== undefined
      ? { catchmentRouting: recipe.catchmentRouting }
      : {}),
```

- [ ] **Step 4: Run tests to confirm pass**

Run: `pnpm exec nx run form-builder:test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/form-builder/src/resolution.ts packages/form-builder/src/resolution.spec.ts
git commit -m "feat(form-builder): pass catchmentRouting through hydrateForm

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: Catchment data files + asset glob

**Files:**
- Create: `apps/api/src/catchment/polyclinic-catchments.geojson`
- Create: `apps/api/src/catchment/polyclinic-routing.ts`
- Modify: `apps/api/project.json` (assets array)

**Interfaces:**
- Produces: `PROGRAMME_CODES: Record<string,string>`, `PARISH_DEFAULTS: Record<string,string>` (both keyed by GeoJSON `properties.name`); the GeoJSON asset in `dist`.

- [ ] **Step 1: Download the GeoJSON**

```bash
mkdir -p apps/api/src/catchment
curl -fsSL "https://raw.githubusercontent.com/govtech-bb/newforms/main/Prototypes/polyclinic-catchments.geojson" \
  -o apps/api/src/catchment/polyclinic-catchments.geojson
# Sanity: 8 features, expected names
node -e "const d=require('./apps/api/src/catchment/polyclinic-catchments.geojson');console.log(d.features.length, d.features.map(f=>f.properties.name))"
```
Expected: `8` and the 8 polyclinic names (Branford Taitt, St. Philip, Maurice Byer, Eunice Gibson, David Thompson H&SSC, Sir Winston Scott, Randal Phillips, Frederick Miller).

- [ ] **Step 2: Write the routing constants**

Create `apps/api/src/catchment/polyclinic-routing.ts`:

```ts
/**
 * Routing data that is NOT in polyclinic-catchments.geojson. Keyed by the
 * GeoJSON `properties.name`. Emails live in the GeoJSON; only these two pieces
 * are ours.
 */

/**
 * Derived placeholder programme codes, one per catchment. The CMS will
 * eventually issue real per-polyclinic routing codes (env-specific); until then
 * these stable slugs make `programme_code` vary by location. Swap the values
 * when the CMS codes arrive — keys must stay in lockstep with the GeoJSON names.
 */
export const PROGRAMME_CODES: Record<string, string> = {
  "Branford Taitt Polyclinic": "TEMP_RESTAURANT_LICENCE_BRANFORD_TAITT",
  "David Thompson Health & Social Services Complex":
    "TEMP_RESTAURANT_LICENCE_DAVID_THOMPSON",
  "Eunice Gibson Polyclinic": "TEMP_RESTAURANT_LICENCE_EUNICE_GIBSON",
  "Frederick Miller Polyclinic": "TEMP_RESTAURANT_LICENCE_FREDERICK_MILLER",
  "Maurice Byer Polyclinic": "TEMP_RESTAURANT_LICENCE_MAURICE_BYER",
  "Randal Phillips Polyclinic": "TEMP_RESTAURANT_LICENCE_RANDAL_PHILLIPS",
  "Sir Winston Scott Polyclinic": "TEMP_RESTAURANT_LICENCE_WINSTON_SCOTT",
  "St. Philip Polyclinic": "TEMP_RESTAURANT_LICENCE_ST_PHILIP",
};

/**
 * Parish select value (`components/parish`) → serving catchment, used only when
 * the submission has no usable coordinates. No parish maps to Branford Taitt or
 * Frederick Miller — those are reachable only by a coordinate hit.
 */
export const PARISH_DEFAULTS: Record<string, string> = {
  "st-lucy": "Maurice Byer Polyclinic",
  "st-peter": "Maurice Byer Polyclinic",
  "st-andrew": "Maurice Byer Polyclinic",
  "st-james": "Maurice Byer Polyclinic",
  "st-thomas": "Eunice Gibson Polyclinic",
  "st-joseph": "David Thompson Health & Social Services Complex",
  "st-john": "David Thompson Health & Social Services Complex",
  "st-george": "David Thompson Health & Social Services Complex",
  "st-philip": "St. Philip Polyclinic",
  "christ-church": "Randal Phillips Polyclinic",
  "st-michael": "Sir Winston Scott Polyclinic",
};
```

- [ ] **Step 3: Register the asset glob**

In `apps/api/project.json`, add to the `build` target's `options.assets` array (alongside the recipes/templates entries):

```json
{ "input": "apps/api/src/catchment", "glob": "**/*.geojson", "output": "src/catchment" }
```

- [ ] **Step 4: Verify the build copies the asset**

Run: `pnpm exec nx run api:build`
Then: `ls apps/api/dist/apps/api/src/catchment/polyclinic-catchments.geojson` (path may vary by dist layout — confirm the `.geojson` lands under the built `src/catchment`).
Expected: file present; build green.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/catchment/polyclinic-catchments.geojson apps/api/src/catchment/polyclinic-routing.ts apps/api/project.json
git commit -m "feat(api): add polyclinic catchment geojson + routing constants

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: `CatchmentRoutingService`

**Files:**
- Create: `apps/api/src/catchment/catchment-routing.service.ts`
- Test: `apps/api/src/catchment/catchment-routing.service.spec.ts`

**Interfaces:**
- Consumes: `PROGRAMME_CODES`, `PARISH_DEFAULTS` (Task 4); the GeoJSON asset.
- Produces:
  ```ts
  export interface CatchmentResolution {
    polyclinic: string;
    programmeCode: string;
    mdaEmail: string | null;
  }
  export class CatchmentRoutingService {
    onModuleInit(): void; // loads + validates
    resolve(input: { coordinates?: string; parish?: string }): CatchmentResolution | null;
  }
  ```

- [ ] **Step 1: Write the failing tests**

Create `apps/api/src/catchment/catchment-routing.service.spec.ts`. Pick one real interior point per catchment from the GeoJSON at authoring time (average a few outer-ring vertices, or eyeball a point well inside). Use `Sir Winston Scott` (central Bridgetown, St. Michael) and `Maurice Byer` (the MultiPolygon) as the anchored cases:

```ts
import { describe, expect, it, beforeAll } from "vitest";
import { CatchmentRoutingService } from "./catchment-routing.service";

describe("CatchmentRoutingService", () => {
  let svc: CatchmentRoutingService;
  beforeAll(() => {
    svc = new CatchmentRoutingService();
    svc.onModuleInit();
  });

  it("resolves a coordinate inside the Sir Winston Scott catchment", () => {
    // "lat,lon" — a point in central Bridgetown / St. Michael.
    const r = svc.resolve({ coordinates: "13.0975,-59.6167" });
    expect(r?.polyclinic).toBe("Sir Winston Scott Polyclinic");
    expect(r?.programmeCode).toBe("TEMP_RESTAURANT_LICENCE_WINSTON_SCOTT");
    expect(r?.mdaEmail).toBe("ehd.wspc@health.gov.bb");
  });

  it("resolves a coordinate inside the MultiPolygon (Maurice Byer) catchment", () => {
    // Replace with a lat,lon you confirm lies inside a Maurice Byer polygon.
    const r = svc.resolve({ coordinates: "13.28,-59.62" });
    expect(r?.polyclinic).toBe("Maurice Byer Polyclinic");
  });

  it("falls back to parish when coordinates are absent", () => {
    const r = svc.resolve({ parish: "christ-church" });
    expect(r?.polyclinic).toBe("Randal Phillips Polyclinic");
  });

  it("falls back to parish when coordinates land outside every catchment (sea)", () => {
    const r = svc.resolve({ coordinates: "13.5,-60.5", parish: "st-michael" });
    expect(r?.polyclinic).toBe("Sir Winston Scott Polyclinic");
  });

  it("treats a lon,lat mix-up as offshore and uses the parish", () => {
    // Correct order for the WSS point is 13.0975,-59.6167; reversed lands in the sea.
    const r = svc.resolve({ coordinates: "-59.6167,13.0975", parish: "st-thomas" });
    expect(r?.polyclinic).toBe("Eunice Gibson Polyclinic");
  });

  it("returns null when neither coordinates nor a known parish resolve", () => {
    expect(svc.resolve({})).toBeNull();
    expect(svc.resolve({ parish: "not-a-parish" })).toBeNull();
  });

  it("resolves Frederick Miller's programme code but a null email", () => {
    // Replace with a lat,lon confirmed inside the Frederick Miller polygon.
    const r = svc.resolve({ coordinates: "13.31,-59.63" });
    expect(r?.polyclinic).toBe("Frederick Miller Polyclinic");
    expect(r?.programmeCode).toBe("TEMP_RESTAURANT_LICENCE_FREDERICK_MILLER");
    expect(r?.mdaEmail).toBeNull();
  });
});
```

> Note: the exact interior lat/lon for Maurice Byer / Frederick Miller must be **confirmed against the polygons** when writing the test (log `svc.resolve` for a candidate, or compute a point-in-ring). Do not ship a guessed coordinate that fails.

- [ ] **Step 2: Run and confirm it fails**

Run: `pnpm exec nx run api:test -- catchment-routing`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the service**

Create `apps/api/src/catchment/catchment-routing.service.ts`:

```ts
import * as fs from "node:fs";
import * as path from "node:path";
import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { PARISH_DEFAULTS, PROGRAMME_CODES } from "./polyclinic-routing";

export interface CatchmentResolution {
  polyclinic: string;
  programmeCode: string;
  /** Null when the Ministry email for this catchment is not yet known. */
  mdaEmail: string | null;
}

/** GeoJSON ring: an array of [lng, lat] pairs. */
type Ring = [number, number][];
/** Polygon: [outerRing, ...holes]. MultiPolygon: [Polygon, ...]. */
interface CatchmentEntry {
  name: string;
  email: string | null;
  programmeCode: string;
  /** Normalised to a list of polygons, each polygon a list of rings. */
  polygons: Ring[][];
}

@Injectable()
export class CatchmentRoutingService implements OnModuleInit {
  private readonly logger = new Logger(CatchmentRoutingService.name);
  private entries: CatchmentEntry[] = [];
  private byName = new Map<string, CatchmentEntry>();

  onModuleInit(): void {
    const file = path.resolve(__dirname, "polyclinic-catchments.geojson");
    const geojson = JSON.parse(fs.readFileSync(file, "utf8")) as {
      features: {
        properties: { name: string; email?: string | null };
        geometry: { type: string; coordinates: unknown };
      }[];
    };

    this.entries = geojson.features.map((f) => {
      const name = f.properties.name;
      const programmeCode = PROGRAMME_CODES[name];
      if (!programmeCode) {
        throw new Error(
          `[catchment] GeoJSON catchment "${name}" has no PROGRAMME_CODES entry`,
        );
      }
      return {
        name,
        email: f.properties.email?.trim() ? f.properties.email : null,
        programmeCode,
        polygons: this.normalisePolygons(f.geometry),
      };
    });

    this.byName = new Map(this.entries.map((e) => [e.name, e]));

    // Structural validation of our own data — fail loud.
    for (const [parish, target] of Object.entries(PARISH_DEFAULTS)) {
      if (!this.byName.has(target)) {
        throw new Error(
          `[catchment] PARISH_DEFAULTS["${parish}"] → unknown catchment "${target}"`,
        );
      }
    }

    // Ministry email gap — warn, do not fail boot.
    const noEmail = this.entries.filter((e) => !e.email).map((e) => e.name);
    if (noEmail.length > 0) {
      this.logger.warn(
        `[catchment] no Ministry email for: ${noEmail.join(", ")} — a coordinate hit there fails the MDA email until supplied`,
      );
    }
  }

  resolve(input: {
    coordinates?: string;
    parish?: string;
  }): CatchmentResolution | null {
    const hit = this.pointHit(input.coordinates);
    const entry = hit ?? this.parishHit(input.parish);
    if (!entry) return null;
    return {
      polyclinic: entry.name,
      programmeCode: entry.programmeCode,
      mdaEmail: entry.email,
    };
  }

  private parishHit(parish?: string): CatchmentEntry | undefined {
    if (!parish) return undefined;
    const name = PARISH_DEFAULTS[parish];
    return name ? this.byName.get(name) : undefined;
  }

  private pointHit(coordinates?: string): CatchmentEntry | undefined {
    if (!coordinates) return undefined;
    const parts = coordinates.split(",");
    if (parts.length !== 2) return undefined;
    const lat = Number(parts[0]);
    const lng = Number(parts[1]);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return undefined;
    return this.entries.find((e) => this.inCatchment(lng, lat, e));
  }

  private inCatchment(lng: number, lat: number, e: CatchmentEntry): boolean {
    return e.polygons.some((poly) => this.inPolygon(lng, lat, poly));
  }

  /** Polygon = [outer, ...holes]. Inside outer and not inside any hole. */
  private inPolygon(lng: number, lat: number, polygon: Ring[]): boolean {
    if (polygon.length === 0) return false;
    if (!this.inRing(lng, lat, polygon[0])) return false;
    for (let i = 1; i < polygon.length; i++) {
      if (this.inRing(lng, lat, polygon[i])) return false;
    }
    return true;
  }

  /** Ray-cast point-in-ring (ring points are [lng, lat]). */
  private inRing(lng: number, lat: number, ring: Ring): boolean {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const xi = ring[i][0];
      const yi = ring[i][1];
      const xj = ring[j][0];
      const yj = ring[j][1];
      if (
        yi > lat !== yj > lat &&
        lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi
      ) {
        inside = !inside;
      }
    }
    return inside;
  }

  private normalisePolygons(geometry: {
    type: string;
    coordinates: unknown;
  }): Ring[][] {
    if (geometry.type === "Polygon") {
      return [geometry.coordinates as Ring[]];
    }
    if (geometry.type === "MultiPolygon") {
      return geometry.coordinates as Ring[][];
    }
    throw new Error(`[catchment] unsupported geometry type "${geometry.type}"`);
  }
}
```

- [ ] **Step 4: Run tests to confirm pass**

Run: `pnpm exec nx run api:test -- catchment-routing`
Expected: PASS. If a Maurice Byer / Frederick Miller test coordinate fails, correct the coordinate (it was a guess) — not the code.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/catchment/catchment-routing.service.ts apps/api/src/catchment/catchment-routing.service.spec.ts
git commit -m "feat(api): CatchmentRoutingService with point-in-polygon + parish fallback

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 6: `CatchmentModule` + register in `SubmissionsModule`

**Files:**
- Create: `apps/api/src/catchment/catchment.module.ts`
- Modify: `apps/api/src/forms/submissions/submissions.module.ts`

**Interfaces:**
- Produces: `CatchmentModule` provides + **exports** `CatchmentRoutingService`, importable by `SubmissionsModule`.

- [ ] **Step 1: Write the module**

Create `apps/api/src/catchment/catchment.module.ts`:

```ts
import { Module } from "@nestjs/common";
import { CatchmentRoutingService } from "./catchment-routing.service";

@Module({
  providers: [CatchmentRoutingService],
  exports: [CatchmentRoutingService],
})
export class CatchmentModule {}
```

- [ ] **Step 2: Import into SubmissionsModule**

In `apps/api/src/forms/submissions/submissions.module.ts`, add `CatchmentModule` to the `imports` array and import it at the top:

```ts
import { CatchmentModule } from "@/catchment/catchment.module";
```

- [ ] **Step 3: Verify DI wiring compiles**

Run: `pnpm exec nx run api:build`
Expected: green (no unresolved-provider or import errors).

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/catchment/catchment.module.ts apps/api/src/forms/submissions/submissions.module.ts
git commit -m "feat(api): wire CatchmentModule into SubmissionsModule

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 7: Carry `resolvedCatchment` on the event + through SQS

**Files:**
- Modify: `apps/api/src/forms/submissions/submissions.types.ts`
- Modify: `apps/api/src/forms/submissions/sqs/submission-sqs-message.interface.ts`
- Modify: `apps/api/src/forms/submissions/sqs/sqs-producer.service.ts`
- Modify: `apps/api/src/forms/submissions/sqs/sqs-consumer.service.ts:272-284`
- Test: `apps/api/src/forms/submissions/sqs/sqs-consumer.service.spec.ts` (append a `toEvent` round-trip if a `toEvent`/message test already exists there; otherwise assert via the consumer's public path)

**Interfaces:**
- Consumes: `CatchmentResolution` (Task 5).
- Produces: `SubmissionCreatedEvent.resolvedCatchment?: CatchmentResolution`; the same optional field on `SubmissionSqsMessage`; producer + `toEvent` copy it through.

- [ ] **Step 1: Write the failing test**

In `apps/api/src/forms/submissions/sqs/sqs-consumer.service.spec.ts`, add a test that a message carrying `resolvedCatchment` round-trips onto the event. If `toEvent` is private (it is), assert through the existing "processMessage passes the event to the processor" path by capturing the processor's received event and checking `event.resolvedCatchment`. Concretely, extend whatever stub/spy the file already uses for `processor.process` and add:

```ts
it("carries resolvedCatchment from the message onto the processed event", async () => {
  // Build/enqueue a message like the file's existing happy-path test, but with:
  //   resolvedCatchment: { polyclinic: "P", programmeCode: "C", mdaEmail: "e@x.bb" }
  // then assert the spied processor.process received event.resolvedCatchment equal to it.
});
```

(Match the file's existing test harness — reuse its message builder and processor spy rather than inventing new ones.)

- [ ] **Step 2: Run and confirm it fails**

Run: `pnpm exec nx run api:test -- sqs-consumer`
Expected: FAIL — `resolvedCatchment` is `undefined` on the event.

- [ ] **Step 3: Implement**

`submissions.types.ts` — import the type and add the field to `SubmissionCreatedEvent` (after `payment?`):
```ts
import type { CatchmentResolution } from "@/catchment/catchment-routing.service";
```
```ts
  /**
   * The polyclinic catchment resolved from the event location (coordinates →
   * point-in-polygon, else parish). Present only for forms with a
   * `catchmentRouting` block; drives webhook programme_code + the
   * `catchment.mdaEmail` recipient. Serialisable so it survives the SQS hop.
   */
  resolvedCatchment?: CatchmentResolution;
```

`submission-sqs-message.interface.ts` — add the same optional field:
```ts
import type { CatchmentResolution } from "@/catchment/catchment-routing.service";
```
```ts
  /** Resolved event-location catchment; see SubmissionCreatedEvent. */
  resolvedCatchment?: CatchmentResolution;
```

`sqs-producer.service.ts` — in the `message` object literal (around line 40-51), add:
```ts
    ...(event.resolvedCatchment
      ? { resolvedCatchment: event.resolvedCatchment }
      : {}),
```

`sqs-consumer.service.ts` — in `toEvent` (lines 272-284) add:
```ts
      resolvedCatchment: msg.resolvedCatchment,
```

- [ ] **Step 4: Run tests to confirm pass**

Run: `pnpm exec nx run api:test -- sqs-consumer`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/forms/submissions/submissions.types.ts apps/api/src/forms/submissions/sqs/submission-sqs-message.interface.ts apps/api/src/forms/submissions/sqs/sqs-producer.service.ts apps/api/src/forms/submissions/sqs/sqs-consumer.service.ts apps/api/src/forms/submissions/sqs/sqs-consumer.service.spec.ts
git commit -m "feat(api): carry resolvedCatchment on the submission event + SQS message

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 8: Resolve the catchment in `submissions.service`

**Files:**
- Modify: `apps/api/src/forms/submissions/submissions.service.ts` (constructor + event build ~127-137)
- Test: `apps/api/src/forms/submissions/submissions.service.spec.ts` (append)

**Interfaces:**
- Consumes: `CatchmentRoutingService.resolve` (Task 5), `contract.catchmentRouting` (Tasks 1+3), `readPath` (`processors/webhook-mapping.ts`).
- Produces: the emitted `submission.created` event carries `resolvedCatchment` when the contract declares `catchmentRouting`.

- [ ] **Step 1: Write the failing test**

Append to `submissions.service.spec.ts` a test that, given a contract with `catchmentRouting` and values holding coordinates, the emitted event has `resolvedCatchment`. Reuse the file's existing service-construction harness and `eventEmitter.emit` spy. Assert:

```ts
it("attaches resolvedCatchment to the emitted event when catchmentRouting is set", async () => {
  // Arrange: contract stub with
  //   catchmentRouting: { coordinatesField: "event-details.event-address-coordinates",
  //                       parishField: "event-details.event-parish" }
  // values: { "event-details": { "event-address-coordinates": "13.0975,-59.6167" } }
  // and a CatchmentRoutingService stub whose resolve() returns
  //   { polyclinic: "Sir Winston Scott Polyclinic", programmeCode: "C", mdaEmail: "e@x.bb" }
  // Act: submit.
  // Assert: the emit spy's event arg has resolvedCatchment.polyclinic === "Sir Winston Scott Polyclinic".
});
```

(Add `CatchmentRoutingService` to the module's providers with a stub in the test, mirroring how the spec stubs other injected services.)

- [ ] **Step 2: Run and confirm it fails**

Run: `pnpm exec nx run api:test -- submissions.service`
Expected: FAIL — `resolvedCatchment` undefined.

- [ ] **Step 3: Implement**

Inject the service in the constructor:
```ts
import { CatchmentRoutingService } from "@/catchment/catchment-routing.service";
import { readPath } from "./processors/webhook-mapping";
```
```ts
    private readonly catchmentRouting: CatchmentRoutingService,
```

Before building `event` (line 127), compute the resolution:
```ts
    // Coordinate-based catchment routing: when the recipe declares which fields
    // hold the event coordinates + parish, resolve the serving polyclinic once
    // here and attach it to the event so both the webhook (programme_code) and
    // the MDA email (catchment.mdaEmail recipient) agree. Absent block → undefined.
    const routing = contract.catchmentRouting;
    const resolvedCatchment = routing
      ? (this.catchmentRouting.resolve({
          coordinates:
            readPath(normalizedValues, routing.coordinatesField) ?? undefined,
          parish: readPath(normalizedValues, routing.parishField) ?? undefined,
        }) ?? undefined)
      : undefined;
```

Add it to the `event` literal (after `isSmokeSubmission`):
```ts
      resolvedCatchment,
```

- [ ] **Step 4: Run tests to confirm pass**

Run: `pnpm exec nx run api:test -- submissions.service`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/forms/submissions/submissions.service.ts apps/api/src/forms/submissions/submissions.service.spec.ts
git commit -m "feat(api): resolve event catchment at submission and attach to the event

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 9: Webhook uses the resolved programme code

**Files:**
- Modify: `apps/api/src/forms/submissions/processors/webhook-mapping.ts:107-139`
- Modify: `apps/api/src/forms/submissions/processors/webhook.processor.ts:115-120`
- Test: `apps/api/src/forms/submissions/processors/webhook-mapping.spec.ts` (append)

**Interfaces:**
- Consumes: `SubmissionCreatedEvent.resolvedCatchment` (Task 7).
- Produces: `buildMappedCasePayload` accepts `programmeCodeOverride?: string`; `programme_code = programmeCodeOverride ?? mapping.programmeCode`.

- [ ] **Step 1: Write the failing test**

Append to `webhook-mapping.spec.ts`:

```ts
it("uses programmeCodeOverride when provided", () => {
  const payload = buildMappedCasePayload({
    mapping: {
      programmeCode: "STATIC",
      applicant: { name: "a.b", email: "a.c", phone: "a.d" },
    },
    values: {},
    referenceCode: "R",
    submittedAt: "2026-07-28T00:00:00Z",
    programmeCodeOverride: "TEMP_RESTAURANT_LICENCE_WINSTON_SCOTT",
  });
  expect(payload.programme_code).toBe("TEMP_RESTAURANT_LICENCE_WINSTON_SCOTT");
});

it("falls back to the static programmeCode when no override", () => {
  const payload = buildMappedCasePayload({
    mapping: {
      programmeCode: "STATIC",
      applicant: { name: "a.b", email: "a.c", phone: "a.d" },
    },
    values: {},
    referenceCode: "R",
    submittedAt: "2026-07-28T00:00:00Z",
  });
  expect(payload.programme_code).toBe("STATIC");
});
```

- [ ] **Step 2: Run and confirm it fails**

Run: `pnpm exec nx run api:test -- webhook-mapping`
Expected: FAIL — override ignored.

- [ ] **Step 3: Implement**

`webhook-mapping.ts` — add to the `buildMappedCasePayload` args object type:
```ts
  /** When set (coordinate-based catchment routing), overrides the static
   *  `mapping.programmeCode`. */
  programmeCodeOverride?: string;
```
Destructure it and use it:
```ts
  const { mapping, values, referenceCode, submittedAt, higherRisk, programmeCodeOverride } = args;
```
```ts
    programme_code: programmeCodeOverride ?? mapping.programmeCode,
```

`webhook.processor.ts` — in the `buildMappedCasePayload({ … })` call (lines 115-120), add:
```ts
            programmeCodeOverride: payload.resolvedCatchment?.programmeCode,
```

- [ ] **Step 4: Run tests to confirm pass**

Run: `pnpm exec nx run api:test -- webhook`
Expected: PASS (webhook-mapping + webhook.processor suites).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/forms/submissions/processors/webhook-mapping.ts apps/api/src/forms/submissions/processors/webhook.processor.ts apps/api/src/forms/submissions/processors/webhook-mapping.spec.ts
git commit -m "feat(api): webhook programme_code from resolved catchment, static fallback

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 10: Email resolves the `catchment.mdaEmail` recipient

**Files:**
- Modify: `apps/api/src/forms/submissions/processors/email.processor.ts` (imports; `processEntry` branch ~130-140; new resolver near `resolveSubmittedRecipient` ~299)
- Test: `apps/api/src/forms/submissions/processors/email.processor.spec.ts` (append)

**Interfaces:**
- Consumes: `classifyRecipientField` → `"catchment"` (Task 2), `SubmissionCreatedEvent.resolvedCatchment` (Task 7).
- Produces: recipient resolves from `payload.resolvedCatchment?.mdaEmail`; unresolved → existing `NO_RECIPIENT` non-retryable for this entry only.

- [ ] **Step 1: Write the failing test**

Append to `email.processor.spec.ts`, reusing the file's harness (its `makeEvent`/processor factory + SES send spy). Two cases:

```ts
it("sends the MDA email to the resolved catchment address", async () => {
  // event with:
  //   processors: [{ type: "email", config: { recipientField: "catchment.mdaEmail", subject: "S" } }]
  //   processorIndex: 0
  //   resolvedCatchment: { polyclinic: "P", programmeCode: "C", mdaEmail: "ehd.wspc@health.gov.bb" }
  // assert the send spy was called with to: "ehd.wspc@health.gov.bb".
});

it("fails NO_RECIPIENT when the resolved catchment has no email", async () => {
  // same, but resolvedCatchment.mdaEmail = null
  // assert process rejects (NonRetryableError) / records NO_RECIPIENT, and no send happened.
});
```

- [ ] **Step 2: Run and confirm it fails**

Run: `pnpm exec nx run api:test -- email.processor`
Expected: FAIL — `catchment.mdaEmail` currently classifies as `submitted` → tries `payload.values["catchment"]` → undefined recipient (wrong reason) or wrong address.

- [ ] **Step 3: Implement**

In `email.processor.ts`, add the branch in `processEntry` (after the `config` branch, before the `else` submitted branch):
```ts
      } else if (kind === "catchment") {
        recipient = this.resolveCatchmentRecipient(payload);
```

Add the resolver method near `resolveSubmittedRecipient`:
```ts
  /**
   * Resolves the MDA recipient for the reserved "catchment.mdaEmail" token from
   * the catchment resolved at submission time (coordinate/parish routing).
   * Returns undefined when nothing resolved or the catchment has no Ministry
   * email yet — the caller then fails this entry NO_RECIPIENT (non-retryable),
   * isolated to this email by per-entry dispatch.
   */
  private resolveCatchmentRecipient(
    payload: SubmissionCreatedEvent,
  ): string | undefined {
    return payload.resolvedCatchment?.mdaEmail ?? undefined;
  }
```

(`classifyRecipientField` already returns `"catchment"` from Task 2; `RecipientKind` includes it, so the `if/else` chain is exhaustive.)

- [ ] **Step 4: Run tests to confirm pass**

Run: `pnpm exec nx run api:test -- email.processor`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/forms/submissions/processors/email.processor.ts apps/api/src/forms/submissions/processors/email.processor.spec.ts
git commit -m "feat(api): resolve catchment.mdaEmail recipient from the resolved catchment

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 11: Recipe wiring, public-contract strip, and full verification

**Files:**
- Modify: `apps/api/src/forms/form-definitions/recipes/apply-for-temporary-restaurant-licence.json`
- Modify: `apps/api/src/forms/form-definitions/form-definitions.service.ts:315`

**Interfaces:**
- Consumes: everything above.
- Produces: the live recipe routes per catchment; `catchmentRouting` does not leak to the public client contract.

- [ ] **Step 1: Edit the recipe**

In `apply-for-temporary-restaurant-licence.json`:

(a) Change the MDA-notification email processor's `recipientField` (the second email processor, currently `"config.mdaEmail"`) to:
```json
"recipientField": "catchment.mdaEmail",
```
Leave the applicant-acknowledgement processor (`applicant-details.email`) and the static `mapping.programmeCode` unchanged.

(b) Add a top-level `catchmentRouting` block (sibling of `processors`/`steps`):
```json
"catchmentRouting": {
  "coordinatesField": "event-details.event-address-coordinates",
  "parishField": "event-details.event-parish"
},
```

- [ ] **Step 2: Strip `catchmentRouting` from the public contract**

In `form-definitions.service.ts:315`, extend the client-path destructure so the internal routing hint is not served publicly:
```ts
      const { processors: _processors, catchmentRouting: _catchmentRouting, ...stripped } = contract;
```

- [ ] **Step 3: Assert the recipe still validates + resolves**

Run: `pnpm exec nx run api:test -- recipe` (and any recipe-guard/loader suite that parses all recipes, e.g. `scripts/webhook-recipe-guards.spec.ts` via its project).
Expected: PASS — the recipe parses against `serviceContractRecipeSchema` (now allowing `catchmentRouting`) and hydrates.

- [ ] **Step 4: Full build + touched-project tests**

Run:
```bash
pnpm exec nx run-many -t build --exclude=landing
pnpm exec nx run form-types:test
pnpm exec nx run form-builder:test
pnpm exec nx run api:test
```
Expected: all green.

- [ ] **Step 5: Manual end-to-end sanity (optional but recommended)**

Boot the API locally (see the local full-stack recipe) and submit the temp-restaurant form once with a St. Michael event address; confirm the `submission.created` handling routes `programme_code = TEMP_RESTAURANT_LICENCE_WINSTON_SCOTT` and the MDA email targets `ehd.wspc@health.gov.bb`. Watch the logs for the Frederick Miller "no Ministry email" warn at boot.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/forms/form-definitions/recipes/apply-for-temporary-restaurant-licence.json apps/api/src/forms/form-definitions/form-definitions.service.ts
git commit -m "feat(forms): route temp restaurant licence per polyclinic catchment

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Self-Review Notes (author)

- **Spec coverage:** §4 data → Task 4; §5 service → Task 5; §6 wiring → Tasks 7-8; §7 processors → Tasks 9-10 + schema in Tasks 1-2; §8 recipe → Task 11; §5 boot validation (structural throw + email warn) → Task 5. Public-leak concern (spec §7 note that catchmentRouting is inert) hardened by the Task 11 strip.
- **Type consistency:** `CatchmentResolution` defined once in `catchment-routing.service.ts` (Task 5) and imported by `submissions.types.ts`, the SQS message, and read via `payload.resolvedCatchment` in Tasks 9-10. `programmeCodeOverride` name identical across `webhook-mapping.ts` and `webhook.processor.ts`. `catchment.mdaEmail` token identical in recipe (Task 11), classifier (Task 2), and resolver (Task 10).
- **Open data items (not code blockers):** Frederick Miller email (null in GeoJSON → boot warn + isolated send failure if hit); Ministry confirmation of all emails; real CMS codes to replace derived placeholders. Tracked in spec §10.
```
