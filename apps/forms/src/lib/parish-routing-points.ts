import type { CatchmentRouting } from "@govtech-bb/form-types";
import type { FormValuesByStep } from "@forms/types";

/**
 * Per-parish fallback coordinate for coordinate-based catchment routing.
 *
 * When an event location cannot be geocoded to a real coordinate (free-text
 * entry, a lookup outage), the catchment must still resolve. Each value here is
 * a point that sits **inside the catchment the parish is assigned to** in the
 * API's `PARISH_DEFAULTS` (apps/api/src/catchment/polyclinic-routing.ts), so
 * the server's point-in-polygon resolves it to exactly that polyclinic — the
 * populated coordinate and the parish routing can never disagree.
 *
 * These are catchment-interior points, not raw geographic parish centres: a
 * parish centroid can fall in a neighbouring catchment, which would contradict
 * "route by parish". Parishes that share a catchment therefore share a point.
 * Derived from the checked-in `polyclinic-catchments.geojson` and verified to
 * resolve back to the assigned catchment; keep in lockstep with `PARISH_DEFAULTS`.
 *
 * Format is `"lat,lng"` — the exact shape the geocoder writes and the catchment
 * service parses.
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
function readPath(data: FormValuesByStep, path: string): unknown {
  return path
    .split(".")
    .reduce<unknown>(
      (node, key) =>
        node && typeof node === "object"
          ? (node as Record<string, unknown>)[key]
          : undefined,
      data,
    );
}

/**
 * Ensure the catchment coordinate is populated so routing always resolves.
 *
 * For a recipe that declares `catchmentRouting`: when the coordinate field is
 * empty (no geocode) but the parish field holds a known parish, write that
 * parish's routing point into the coordinate field. A real geocoded coordinate
 * is left untouched. Forms without `catchmentRouting`, or with no recognised
 * parish, pass through unchanged. Returns a new object; the input is not mutated.
 */
export function fillParishRoutingCoordinate(
  data: FormValuesByStep,
  catchmentRouting: CatchmentRouting | undefined,
): FormValuesByStep {
  if (!catchmentRouting) return data;
  const { coordinatesField, parishField } = catchmentRouting;

  const existing = readPath(data, coordinatesField);
  if (typeof existing === "string" && existing.trim() !== "") return data;

  const parish = readPath(data, parishField);
  const point =
    typeof parish === "string" ? PARISH_ROUTING_POINTS[parish] : undefined;
  if (!point) return data;

  // catchmentRouting paths are `stepId.fieldId` (two levels) — the shape every
  // recipe uses. Set the coordinate on its step object without mutating input.
  const dot = coordinatesField.indexOf(".");
  const stepId = coordinatesField.slice(0, dot);
  const fieldId = coordinatesField.slice(dot + 1);
  const step = (data[stepId] ?? {}) as Record<string, unknown>;
  return { ...data, [stepId]: { ...step, [fieldId]: point } };
}
