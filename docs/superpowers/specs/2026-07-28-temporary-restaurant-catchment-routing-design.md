# Coordinate-based catchment routing — temporary restaurant licence

**Date:** 2026-07-28
**Form:** `apply-for-temporary-restaurant-licence` (currently `visibility: draft`)
**Related:** [2026-07-22 temporary restaurant licence integration design](./2026-07-22-temporary-restaurant-licence-integration-design.md)
**Prototype:** `govtech-bb/newforms` → `Prototypes/temporary-restaurant-licence.html` (+ `Prototypes/polyclinic-catchments.geojson`)

## 1. Problem

The webhook processor's `programmeCode` and the MDA-notification email's recipient are both **static single values** in the recipe today:

- `programmeCode: "TEMP-RESTAURANT-LICENCE"` — copied verbatim into the outbound webhook payload's `programme_code` by `webhook-mapping.ts`.
- MDA email `recipientField: "config.mdaEmail"` — resolved by `FormConfigService.resolveMdaEmail(formId)`, which returns **one email per form**.

Environmental Health services in Barbados are organised into **polyclinic catchment areas**. An application must reach the polyclinic that serves the **event location**, so both values must be selected per-submission from where the event is.

## 2. Inputs already in the submission

The event step captures location two ways, both auto-filled by the Barbados-locked Nominatim geocoder (`components/address-lookup` → `geocodeTargets`):

- `event-details.event-address-coordinates` — a hidden field holding a `"lat,lon"` **string** (WGS84 decimal degrees), e.g. `"13.0975,-59.6167"`. May be empty when the geocoder fails and the applicant types a free-text address.
- `event-details.event-parish` — a required parish select value (e.g. `st-michael`), also geocoder-filled. Reliable backstop.

## 3. Routing rule

Resolve the event location to one of **8 polyclinic catchments**, which determines both `programme_code` and the recipient email:

1. Parse `event-address-coordinates`; if a valid `"lat,lon"`, run **point-in-polygon** against the 8 catchment polygons → catchment.
2. Else (no/blank coordinates, or the point falls outside all polygons) → `event-parish` via a **parish → catchment** table → catchment.
3. Else → **nothing** (no ultimate default — see §7).

Since `event-parish` is required and geocoder-filled, step 2 effectively always yields a catchment.

## 4. Data — reused from the prototype

The prototype already reprojected the Ministry's `Barbados_Polyclinics.shp` (Barbados National Grid, EPSG:21292) to WGS84 and validated point-in-polygon against it. We **reuse that output** rather than re-doing the CRS transform.

### 4.1 Geometry — `apps/api/src/catchment/polyclinic-catchments.geojson`

The prototype's `Prototypes/polyclinic-catchments.geojson` (8 `Polygon` features, WGS84, `properties.polyclinic`). Checked in and registered as an `assets` glob in `apps/api/project.json` so it lands in `dist` (mirrors `RecipeFileLoaderService` / email templates).

The 8 catchment polyclinic names:

| # | Polyclinic (catchment) |
|---|---|
| 1 | Branford Taitt Polyclinic |
| 2 | David Thompson Health & Social Services Complex |
| 3 | Eunice Gibson Polyclinic |
| 4 | Frederick Miller Polyclinic |
| 5 | Maurice Byer Polyclinic |
| 6 | Randal Phillips Polyclinic |
| 7 | Sir Winston Scott Polyclinic |
| 8 | St. Philip Polyclinic |

> Naming note: the raw shapefile used "Black rock polyclinic" / "Winston Scott"; the prototype standardised these to "Branford Taitt Polyclinic" (Black Rock address) / "Sir Winston Scott Polyclinic". We follow the **prototype** names — they are the join key to the routing table.

### 4.2 Routing table — `apps/api/src/catchment/polyclinic-routing.json`

```jsonc
{
  "catchments": {
    "Branford Taitt Polyclinic":                          { "programmeCode": "TEMP-RESTAURANT-LICENCE-BRANFORD-TAITT",  "mdaEmail": "Ehd.btpc@health.gov.bb" },
    "David Thompson Health & Social Services Complex":     { "programmeCode": "TEMP-RESTAURANT-LICENCE-DAVID-THOMPSON",  "mdaEmail": "Dthssc.ehd@health.gov.bb" },
    "Eunice Gibson Polyclinic":                            { "programmeCode": "TEMP-RESTAURANT-LICENCE-EUNICE-GIBSON",   "mdaEmail": "environmentalhealthegpc@gmail.com" },
    "Frederick Miller Polyclinic":                         { "programmeCode": "TEMP-RESTAURANT-LICENCE-FREDERICK-MILLER","mdaEmail": "TODO — MISSING (see §8)" },
    "Maurice Byer Polyclinic":                             { "programmeCode": "TEMP-RESTAURANT-LICENCE-MAURICE-BYER",    "mdaEmail": "mbpc.apps@health.gov.bb" },
    "Randal Phillips Polyclinic":                          { "programmeCode": "TEMP-RESTAURANT-LICENCE-RANDAL-PHILLIPS", "mdaEmail": "Rppc.ehd@health.gov.bb" },
    "Sir Winston Scott Polyclinic":                        { "programmeCode": "TEMP-RESTAURANT-LICENCE-WINSTON-SCOTT",   "mdaEmail": "ehd.wspc@health.gov.bb" },
    "St. Philip Polyclinic":                               { "programmeCode": "TEMP-RESTAURANT-LICENCE-ST-PHILIP",       "mdaEmail": "stphillippolyclinicehd@gmail.com" }
  },
  "parishDefaults": {
    "st-lucy":       "Maurice Byer Polyclinic",
    "st-peter":      "Maurice Byer Polyclinic",
    "st-andrew":     "Maurice Byer Polyclinic",
    "st-james":      "Maurice Byer Polyclinic",
    "st-thomas":     "Eunice Gibson Polyclinic",
    "st-joseph":     "David Thompson Health & Social Services Complex",
    "st-john":       "David Thompson Health & Social Services Complex",
    "st-george":     "David Thompson Health & Social Services Complex",
    "st-philip":     "St. Philip Polyclinic",
    "christ-church": "Randal Phillips Polyclinic",
    "st-michael":    "Sir Winston Scott Polyclinic"
  }
}
```

- **`programmeCode`** values are **derived placeholders** (`TEMP-RESTAURANT-LICENCE-<SLUG>`, slug = the polyclinic name upper-kebabed, dropping the "Polyclinic" / "Health & Social Services Complex" suffix). They are pinned explicitly (not computed at runtime) so they are reviewable and trivially swappable for real CMS-generated codes later.
- **`mdaEmail`** values come from the prototype's `POLYCLINIC_CONTACTS`, flagged there as *"APPROXIMATE prototype data — confirm with the Ministry"*.
- **`parishDefaults`** uses the form's parish select values (kebab-case) — the prototype keyed by display name ("St. Michael"); we normalise to the `components/parish` values to match `event-parish`.
- **No top-level `default`** entry — the ultimate default is intentionally removed.

## 5. `CatchmentRoutingService` (`apps/api/src/catchment/`)

An `@Injectable` that loads both files once at `onModuleInit` (via `fs.readFile` + `path.resolve(__dirname, …)`, mirroring `RecipeFileLoaderService`) into memory.

**Boot-time validation (fail loud):** every `properties.polyclinic` in the GeoJSON MUST have a `catchments` entry with a non-empty `mdaEmail` **and** `programmeCode`; every `parishDefaults` value MUST be a known catchment. A missing/blank entry throws at startup. This converts the Frederick Miller email gap (§8) into a boot failure rather than a silent empty-recipient batch drop at submission time.

**Public method:**

```ts
interface CatchmentResolution { polyclinic: string; programmeCode: string; mdaEmail: string; }

resolve(input: { coordinates?: string; parish?: string }): CatchmentResolution | null
```

- Parse `coordinates` as `"lat,lon"` → numbers. **Coordinate-order care:** the field stores `lat,lon`; GeoJSON rings are `[lng, lat]`. Point-in-polygon must test `(lng, lat)`.
- Ray-cast point-in-polygon (dependency-free, ported from the prototype's `inRing`/`pointInPolyclinic`) over the 8 polygons.
- On no coordinate hit, look up `parishDefaults[parish]`.
- Return the catchment's `{ polyclinic, programmeCode, mdaEmail }`, or `null` if neither path resolves.

## 6. Wiring — resolve once, feed both processors

Processors do **not** share a mutable context and the event is JSON-serialised across SQS (`sqs-consumer.service.ts`). So resolve once, up front, and carry the result as a **declared, serialisable field** on the event.

1. **Recipe** declares the field paths once, in a new top-level block:
   ```jsonc
   "catchmentRouting": {
     "coordinatesField": "event-details.event-address-coordinates",
     "parishField": "event-details.event-parish"
   }
   ```
2. In the submission pipeline, **before processor dispatch** (where the full contract + submitted `values` are in hand), read those paths, call `CatchmentRoutingService.resolve(...)`, and attach the result to the event as `resolvedCatchment`.
3. Add `resolvedCatchment?: CatchmentResolution` to `SubmissionCreatedEvent` (`submissions.types.ts`) and to the SQS message interface, and copy it through `toEvent` so both the direct-call and SQS paths carry it. (The temp-restaurant form has no gating/payment processor, so the gating event path is out of scope.)

## 7. Processor changes

- **Webhook** (`webhook-mapping.ts` / `webhook.processor.ts`): `programme_code = event.resolvedCatchment?.programmeCode ?? mapping.programmeCode`. The recipe's static `programmeCode` stays as the **non-empty safety fallback** (an empty `programme_code` is invalid downstream).
- **Email** (`email.processor.ts` + `recipient-field.ts`): add a new `RecipientKind` — `catchment`. `classifyRecipientField` returns `catchment` for the exact token `catchment.mdaEmail`; a new `resolveCatchmentRecipient` reads `event.resolvedCatchment?.mdaEmail`. Unresolved → the existing unresolved-recipient degradation (prod `MDA_REQUIRE_RECIPIENT` guard / non-prod default inbox) — **no new default introduced**.
- **Schemas** (`packages/form-types/src/processor.type.ts`): add the `catchment.mdaEmail` recipient token to the recipient union, and declare the top-level `catchmentRouting` block on the recipe/service-contract schema. Because the resolved-time Zod schemas **strip unknown keys**, anything new must be declared in the *resolved* schema or it is dropped before the processor runs.

## 8. Recipe changes (`apply-for-temporary-restaurant-licence.json`)

- Add the top-level `catchmentRouting` block (§6.1).
- Change the MDA-notification email processor's `recipientField` from `"config.mdaEmail"` to `"catchment.mdaEmail"` (line ~24). The applicant-acknowledgement processor (`applicant-details.email`) is unchanged.
- Keep `mapping.programmeCode: "TEMP-RESTAURANT-LICENCE"` as the fallback (line ~31).

## 9. Testing

- **`CatchmentRoutingService`** (`api`): a real lat/lon inside each of the 8 polygons → correct polyclinic + code + email; a point offshore → parish fallback; missing coordinates → parish fallback; unknown/missing parish with no coordinates → `null`; coordinate-order regression (a `lon,lat` mix-up would land in the sea → asserts we parse `lat,lon`); **boot validation throws** when a catchment lacks an email/code or a `parishDefaults` value is unknown.
- **Webhook** (`api`): `resolvedCatchment` present → its `programmeCode`; absent → static `programmeCode` (regression for other forms).
- **Email** (`api`): `classifyRecipientField("catchment.mdaEmail") === "catchment"`; resolves from `resolvedCatchment.mdaEmail`; unresolved degrades exactly as `config.mdaEmail` does today.
- **Schema** (`packages/form-types`): `catchmentRouting` and the `catchment.mdaEmail` token survive a resolved-time parse.
- Run `nx run api:test`, `nx run form-types:test` (and `forms` if touched), plus `nx run-many -t build --exclude=landing`.

## 10. Open data items (launch blockers — data, not code)

These block **go-live**, not the build (boot validation forces them to be filled before deploy):

1. **Frederick Miller Polyclinic has no email** in the prototype (it has a catchment polygon but no `POLYCLINIC_CONTACTS` entry, and no parish routes to it). Need its EHD inbox, or an explicit decision to merge its polygon into a neighbour. Until provided, the service will not boot (by design).
2. **Confirm all 8 emails with the Ministry** — the prototype values are self-described as approximate, and two are `@gmail.com`.
3. **Real CMS routing codes** must replace the derived `programmeCode` placeholders once the CMS generates per-polyclinic queues (the [2026-07-22 spec §13](./2026-07-22-temporary-restaurant-licence-integration-design.md) notes these are CMS-generated and environment-specific).

## 11. Explicitly out of scope

- The DB directory (`mda_contact.cms_routing_code` + `form_mda_route`) from the 2026-07-22 spec §12 B2. Deferred: chosen data home is a checked-in file for this iteration. If per-environment, ops-editable routing is later required, migrating the routing table into that directory is the follow-up.
- Any client-side map / pin-drop UI (the prototype's Leaflet map). Routing is server-side from the already-captured coordinates + parish.
- The gating/payment event path (this form has no gating processor).
