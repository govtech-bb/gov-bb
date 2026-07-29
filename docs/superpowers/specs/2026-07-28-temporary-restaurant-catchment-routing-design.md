# Coordinate-based catchment routing — temporary restaurant licence

**Date:** 2026-07-28
**Form:** `apply-for-temporary-restaurant-licence` (currently `visibility: draft`)
**Related:** [2026-07-22 temporary restaurant licence integration design](./2026-07-22-temporary-restaurant-licence-integration-design.md)
**Prototype:** `govtech-bb/newforms` → `Prototypes/temporary-restaurant-licence.html` (+ `Prototypes/polyclinic-catchments.geojson`)

## 1. Problem

The webhook processor's `programmeCode` and the MDA-notification email's recipient are both **static single values** in the recipe today:

- `programmeCode: "TEMP_RESTAURANT_LICENCE"` — copied verbatim into the outbound webhook payload's `programme_code` by `webhook-mapping.ts`.
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

### 4.1 Geometry + emails — `apps/api/src/catchment/polyclinic-catchments.geojson`

Reused **verbatim** from the prototype's `Prototypes/polyclinic-catchments.geojson`: a `FeatureCollection` of 8 catchment features, WGS84, coordinates in `[lng, lat]` order. Checked in and registered as an `assets` glob in `apps/api/project.json` so it lands in `dist` (mirrors `RecipeFileLoaderService` / email templates).

Each feature's `properties` carries `{ name, official_name, mock, phone, email }` — so the **per-catchment email is already in this file** and is read from it (not transcribed elsewhere). Join key is `properties.name` (the prototype display name, e.g. `"Sir Winston Scott Polyclinic"`); `official_name` is the raw shapefile name.

Geometry shape to handle: **7 are `Polygon`, 1 (`Maurice Byer Polyclinic`) is a `MultiPolygon`**, and a `Polygon` may include holes (`coordinates[0]` outer ring, `coordinates[1..]` holes). Point-in-polygon must handle both types and treat holes correctly.

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

### 4.2 Routing constants — `apps/api/src/catchment/polyclinic-routing.ts`

The two pieces of routing data **not** in the GeoJSON are small, static, and ours, so they live in a typed TS constants module (no second asset glob / fs parse), keyed by `properties.name`:

```ts
/** Derived placeholder programme codes — swap for real CMS codes when issued. */
export const PROGRAMME_CODES: Record<string, string> = {
  "Branford Taitt Polyclinic":                       "TEMP_RESTAURANT_LICENCE_BRANFORD_TAITT",
  "David Thompson Health & Social Services Complex": "TEMP_RESTAURANT_LICENCE_DAVID_THOMPSON",
  "Eunice Gibson Polyclinic":                        "TEMP_RESTAURANT_LICENCE_EUNICE_GIBSON",
  "Frederick Miller Polyclinic":                     "TEMP_RESTAURANT_LICENCE_FREDERICK_MILLER",
  "Maurice Byer Polyclinic":                         "TEMP_RESTAURANT_LICENCE_MAURICE_BYER",
  "Randal Phillips Polyclinic":                      "TEMP_RESTAURANT_LICENCE_RANDAL_PHILLIPS",
  "Sir Winston Scott Polyclinic":                    "TEMP_RESTAURANT_LICENCE_WINSTON_SCOTT",
  "St. Philip Polyclinic":                           "TEMP_RESTAURANT_LICENCE_ST_PHILIP",
};

/** Parish select value → serving catchment (the coordinate-less fallback). */
export const PARISH_DEFAULTS: Record<string, string> = {
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
  "st-michael":    "Sir Winston Scott Polyclinic",
};
```

- **`PROGRAMME_CODES`** are **derived placeholders** (`TEMP_RESTAURANT_LICENCE_<SLUG>`), pinned explicitly (not computed at runtime) so they are reviewable and trivially swappable for real CMS-generated codes later.
- **Emails are NOT here** — they come from each GeoJSON feature's `email` property.
- **`PARISH_DEFAULTS`** uses the form's parish select values (kebab-case). The prototype keyed by display name ("St. Michael"); we normalise to the `components/parish` values to match `event-parish`. No parish maps to Branford Taitt or Frederick Miller (those catchments are reachable only by a coordinate hit).
- **No `default`** entry — the ultimate default is intentionally removed.

## 5. `CatchmentRoutingService` (`apps/api/src/catchment/`)

An `@Injectable` that at `onModuleInit` loads the GeoJSON once (via `fs.readFile` + `path.resolve(__dirname, …)`, mirroring `RecipeFileLoaderService`) and imports `PROGRAMME_CODES` / `PARISH_DEFAULTS`, building an in-memory index keyed by `properties.name` of `{ polygons, email, programmeCode }`.

**Boot-time validation — structural (our data, fail loud):** every GeoJSON `properties.name` MUST have a `PROGRAMME_CODES` entry, and every `PARISH_DEFAULTS` value MUST be a known catchment name. A mismatch throws at startup (a transcription slip in our own files must never ship silently). This is limited to data under our control.

**Boot-time check — email (Ministry data, warn only):** any catchment whose GeoJSON `email` is null/blank is logged as a `warn` at startup (names Frederick Miller today). It does **not** fail boot — a missing Ministry email must not block the API from starting for unrelated work. It surfaces again, loudly and isolated, at send time (§7).

**Public method:**

```ts
interface CatchmentResolution { polyclinic: string; programmeCode: string; mdaEmail: string | null; }

resolve(input: { coordinates?: string; parish?: string }): CatchmentResolution | null
```

- Parse `coordinates` as `"lat,lon"` → numbers. **Coordinate-order care:** the field stores `lat,lon`; GeoJSON coordinates are `[lng, lat]`. Point-in-polygon must test `(lng, lat)`.
- Ray-cast point-in-polygon (dependency-free, ported from the prototype's `inRing`/`pointInPolyclinic`), handling `Polygon` (outer ring minus holes) and `MultiPolygon`, over all catchments.
- On no coordinate hit, look up `PARISH_DEFAULTS[parish]`.
- Return `{ polyclinic, programmeCode, mdaEmail }` (email may be `null` for a catchment with no Ministry email yet), or `null` if neither path resolves.

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

- **Webhook** (`webhook-mapping.ts` / `webhook.processor.ts`): add an optional `programmeCodeOverride?: string` arg to `buildMappedCasePayload`; the processor passes `payload.resolvedCatchment?.programmeCode`, and the payload sets `programme_code = programmeCodeOverride ?? mapping.programmeCode`. The recipe's static `programmeCode` stays as the **non-empty safety fallback** (an empty `programme_code` is invalid downstream). No webhook schema change — routing comes from the event, not a new mapping field.
- **Email** (`email.processor.ts` + `recipient-field.ts`): add a new `RecipientKind` — `catchment`. `classifyRecipientField` returns `catchment` for the `catchment.` prefix (only `catchment.mdaEmail` is defined). A new `resolveCatchmentRecipient(payload)` returns `payload.resolvedCatchment?.mdaEmail ?? undefined`. When that is undefined (no resolution, or a catchment with no Ministry email — Frederick Miller), `recipient` is falsy and the existing `NO_RECIPIENT` **non-retryable** path fires for **this entry only** — per-entry dispatch means the applicant-acknowledgement email (a separate entry) is unaffected, and the failure is recorded to `notification_log` + DLQ, never silent. **No new default introduced.**
- **Schema** (`packages/form-types/src/service-contract.type.ts`): declare the optional top-level `catchmentRouting` block on the service-contract / recipe schema so it is typed and survives parsing. No `processor.type.ts` change is needed: `recipientField` is already `z.string().min(1)` (author + resolved), so `catchment.mdaEmail` passes through verbatim, and `programmeCode` stays a plain literal.

## 8. Recipe changes (`apply-for-temporary-restaurant-licence.json`)

- Add the top-level `catchmentRouting` block (§6.1).
- Change the MDA-notification email processor's `recipientField` from `"config.mdaEmail"` to `"catchment.mdaEmail"` (line ~24). The applicant-acknowledgement processor (`applicant-details.email`) is unchanged.
- Keep `mapping.programmeCode: "TEMP_RESTAURANT_LICENCE"` as the fallback (line ~31).

## 9. Testing

- **`CatchmentRoutingService`** (`api`): a real lat/lon inside each of the 8 catchments → correct polyclinic + code + email; a point inside the `MultiPolygon` catchment (Maurice Byer) resolves; a point offshore → parish fallback; missing coordinates → parish fallback; unknown/missing parish with no coordinates → `null`; coordinate-order regression (a `lon,lat` mix-up lands in the sea → asserts we parse `lat,lon`); **structural boot validation throws** when a GeoJSON name lacks a `PROGRAMME_CODES` entry or a `PARISH_DEFAULTS` value is unknown; a catchment with a null email → resolves with `mdaEmail: null` and emits a startup `warn` (does not throw).
- **Webhook** (`api`): `resolvedCatchment` present → its `programmeCode`; absent → static `programmeCode` (regression for other forms).
- **Email** (`api`): `classifyRecipientField("catchment.mdaEmail") === "catchment"`; resolves from `resolvedCatchment.mdaEmail`; unresolved degrades exactly as `config.mdaEmail` does today.
- **Schema** (`packages/form-types`): `catchmentRouting` and the `catchment.mdaEmail` token survive a resolved-time parse.
- Run `nx run api:test`, `nx run form-types:test` (and `forms` if touched), plus `nx run-many -t build --exclude=landing`.

## 10. Open data items (launch blockers — data, not code)

These block **go-live**, not the build (boot validation forces them to be filled before deploy):

1. **Frederick Miller Polyclinic has no email** — its GeoJSON `email` is `null`, and no parish routes to it (reachable only by a coordinate hit). Startup logs a `warn`; a real coordinate hit in its polygon fails the MDA-email entry loudly (isolated, DLQ'd) until its EHD inbox is supplied or its polygon is merged into a neighbour.
2. **Confirm all 8 emails with the Ministry** — the prototype values are self-described as approximate, and two are `@gmail.com`.
3. **Real CMS routing codes** must replace the derived `programmeCode` placeholders once the CMS generates per-polyclinic queues (the [2026-07-22 spec §13](./2026-07-22-temporary-restaurant-licence-integration-design.md) notes these are CMS-generated and environment-specific).

## 11. Explicitly out of scope

- The DB directory (`mda_contact.cms_routing_code` + `form_mda_route`) from the 2026-07-22 spec §12 B2. Deferred: chosen data home is a checked-in file for this iteration. If per-environment, ops-editable routing is later required, migrating the routing table into that directory is the follow-up.
- Any client-side map / pin-drop UI (the prototype's Leaflet map). Routing is server-side from the already-captured coordinates + parish.
- The gating/payment event path (this form has no gating processor).
