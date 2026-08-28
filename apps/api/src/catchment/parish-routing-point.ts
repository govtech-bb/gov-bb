import type {
  CatchmentRouting,
  SubmissionValues,
} from "@govtech-bb/form-types";

/**
 * Per-parish fallback coordinate for coordinate-based catchment routing.
 *
 * The coordinate a routed form reads is written by an `address-lookup` field's
 * `geocodeTargets` — which only fires when the applicant picks a suggestion. A
 * free-typed address, an address Nominatim has no match for, or a `/geocode`
 * outage all leave it empty, and then nothing routes: the CMS gets no
 * coordinate, `catchment.mdaEmail` finds no inbox, and the confirmation page
 * shows the generic "your local polyclinic".
 *
 * Each value is the **centre of the parish itself**, not the polyclinic that
 * serves it. The filled coordinate is persisted and reaches the CMS, where a
 * case reviewer opens it on a map — and a pin sitting on the polyclinic reads
 * as "the premises is at the clinic", which is worse than a vague pin because
 * it looks precise. A parish centre reads as what it is: somewhere in this
 * parish, location not captured.
 *
 * Every point must also sit **inside the catchment the parish is assigned to**
 * in {@link PARISH_DEFAULTS}, so the point-in-polygon resolves it to exactly
 * that polyclinic — the filled coordinate and the parish fallback can never
 * disagree. `parish-routing-point.spec.ts` asserts that for every parish.
 *
 * Those two requirements conflict for two parishes, because the catchment
 * boundaries do not follow parish lines: the true centroid of St George falls
 * in the St. Philip catchment, and the true centroid of Christ Church falls in
 * Sir Winston Scott's. Both are nudged to the nearest point that is still
 * inside the parish and inside the right catchment (1.4 km and 0.2 km
 * respectively). The other nine are exact parish centroids.
 *
 * Derived from the OSM parish boundaries: area-weighted centroid of each
 * parish's largest polygon, then constrained against
 * `polyclinic-catchments.geojson` as above.
 *
 * Format is `"lat,lng"` — the exact shape the geocoder writes and
 * `CatchmentRoutingService.pointHit` parses.
 */
export const PARISH_ROUTING_POINTS: Record<string, string> = {
  "st-lucy": "13.304148,-59.617800", // parish centroid
  "st-peter": "13.261630,-59.614991", // parish centroid
  "st-andrew": "13.244468,-59.577203", // parish centroid
  "st-james": "13.192824,-59.622727", // parish centroid
  "st-thomas": "13.178249,-59.588388", // parish centroid
  "st-joseph": "13.204067,-59.546074", // parish centroid
  "st-john": "13.174489,-59.501041", // parish centroid
  "st-george": "13.148487,-59.552524", // centroid nudged 1.4km into the David Thompson catchment
  "st-philip": "13.129708,-59.464187", // parish centroid
  "christ-church": "13.082879,-59.529742", // centroid nudged 0.2km into the Randal Phillips catchment
  "st-michael": "13.117036,-59.600524", // parish centroid
};

/**
 * A usable routing coordinate: the `"lat,lng"` decimal pair the geocoder writes
 * and {@link PARISH_ROUTING_POINTS} holds, and the only shape
 * `CatchmentRoutingService.pointHit` can parse.
 *
 * Anything else in the field is not an answer worth keeping. The field is
 * `ui.hidden` and written only by an address lookup's `geocodeTargets`, so a
 * malformed value cannot have come from the applicant — and treating it as
 * present would block the parish fill, send the CMS junk, and resolve no
 * polyclinic. Integer pairs are rejected too: the geocoder never emits one, and
 * a bare `"13,-59"` is far likelier to be a stray value than a real location.
 */
export function isRoutingCoordinate(value: unknown): boolean {
  return typeof value === "string" && /^-?\d+\.\d+,-?\d+\.\d+$/.test(value);
}

/** Read a `"stepId.fieldId"` path out of the step-nested submission values. */
function readPath(values: SubmissionValues, path: string): unknown {
  const dot = path.indexOf(".");
  if (dot === -1) return undefined;
  const step = values[path.slice(0, dot)];
  if (!step || Array.isArray(step)) return undefined;
  return step[path.slice(dot + 1)];
}

/**
 * Ensure the catchment coordinate is populated so routing always resolves.
 *
 * When the coordinate field is empty but the parish field holds a known parish,
 * write that parish's routing point into the coordinate field. A real geocoded
 * coordinate is left untouched — "real" meaning it passes
 * {@link isRoutingCoordinate}, so a blank or malformed value is treated as
 * absent rather than blocking the fill. No recognised parish → unchanged, and
 * the caller rejects the submission rather than routing it nowhere.
 *
 * Runs server-side, on the normalized values, so the filled coordinate is
 * persisted and reaches the CMS webhook. It lived in `apps/forms` first (#2152)
 * and never ran: the API strips `catchmentRouting` from the client contract, so
 * the client always passed `undefined` and the fill was a no-op.
 *
 * Returns a new object; the input is not mutated.
 */
export function fillParishRoutingCoordinate(
  values: SubmissionValues,
  routing: CatchmentRouting,
): SubmissionValues {
  if (isRoutingCoordinate(readPath(values, routing.coordinatesField))) {
    return values;
  }

  const parish = readPath(values, routing.parishField);
  const point =
    typeof parish === "string" ? PARISH_ROUTING_POINTS[parish] : undefined;
  if (!point) return values;

  const dot = routing.coordinatesField.indexOf(".");
  const stepId = routing.coordinatesField.slice(0, dot);
  const fieldId = routing.coordinatesField.slice(dot + 1);
  const step = values[stepId];
  const stepValues = step && !Array.isArray(step) ? step : {};
  return { ...values, [stepId]: { ...stepValues, [fieldId]: point } };
}
