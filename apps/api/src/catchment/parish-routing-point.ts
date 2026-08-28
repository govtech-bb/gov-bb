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
 * Each value here is a point that sits **inside the catchment the parish is
 * assigned to** in {@link PARISH_DEFAULTS}, so the point-in-polygon resolves it
 * to exactly that polyclinic — the filled coordinate and the parish fallback can
 * never disagree. `parish-routing-point.spec.ts` asserts that for every parish.
 *
 * These are catchment-interior points, not raw geographic parish centres: a
 * parish centroid can fall in a neighbouring catchment, which would contradict
 * "route by parish". Parishes that share a catchment therefore share a point.
 *
 * Format is `"lat,lng"` — the exact shape the geocoder writes and
 * `CatchmentRoutingService.pointHit` parses.
 */
export const PARISH_ROUTING_POINTS: Record<string, string> = {
  "st-lucy": "13.260239,-59.605645", // Maurice Byer Polyclinic
  "st-peter": "13.260239,-59.605645", // Maurice Byer Polyclinic
  "st-andrew": "13.260239,-59.605645", // Maurice Byer Polyclinic
  "st-james": "13.260239,-59.605645", // Maurice Byer Polyclinic
  "st-thomas": "13.169582,-59.596312", // Eunice Gibson Polyclinic
  "st-joseph": "13.177104,-59.523270", // David Thompson Complex
  "st-john": "13.177104,-59.523270", // David Thompson Complex
  "st-george": "13.177104,-59.523270", // David Thompson Complex
  "st-philip": "13.136724,-59.464209", // St. Philip Polyclinic
  "christ-church": "13.082379,-59.515803", // Randal Phillips Polyclinic
  "st-michael": "13.097442,-59.575067", // Sir Winston Scott Polyclinic
};

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
 * coordinate is left untouched. No recognised parish → unchanged, and the
 * caller rejects the submission rather than routing it nowhere.
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
  const existing = readPath(values, routing.coordinatesField);
  if (typeof existing === "string" && existing.trim() !== "") return values;

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
