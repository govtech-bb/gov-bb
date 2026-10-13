import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import * as path from "node:path";
import { Injectable } from "@nestjs/common";
import { z } from "zod";

const positionSchema = z.tuple([
  z.number().min(-180).max(180),
  z.number().min(-90).max(90),
]);
const ringSchema = z
  .array(positionSchema)
  .min(4)
  .refine(
    (ring) =>
      ring.length >= 4 &&
      ring[0][0] === ring[ring.length - 1][0] &&
      ring[0][1] === ring[ring.length - 1][1],
    "A ring must be closed",
  );
const polygonSchema = z.array(ringSchema).min(1);
const featureSchema = z.object({
  type: z.literal("Feature"),
  id: z.string().min(1),
  properties: z.object({ name: z.string().min(1) }),
  geometry: z.discriminatedUnion("type", [
    z.object({ type: z.literal("Polygon"), coordinates: polygonSchema }),
    z.object({
      type: z.literal("MultiPolygon"),
      coordinates: z.array(polygonSchema).min(1),
    }),
  ]),
});
const sourceSchema = z
  .object({
    type: z.literal("FeatureCollection"),
    features: z.array(featureSchema).min(1),
  })
  .superRefine(({ features }, ctx) => {
    for (const field of ["id", "name"] as const) {
      const seen = new Set<string>();
      features.forEach((feature, index) => {
        const value = field === "id" ? feature.id : feature.properties.name;
        if (seen.has(value)) {
          ctx.addIssue({
            code: "custom",
            path: ["features", index],
            message: `Duplicate catchment ${field}: ${value}`,
          });
        }
        seen.add(value);
      });
    }
  });

export type CatchmentFeature = z.infer<typeof featureSchema>;
type Ring = z.infer<typeof ringSchema>;

export interface CatchmentDataset {
  type: "FeatureCollection";
  datasetId: "polyclinics";
  revision: string;
  features: CatchmentFeature[];
}

export interface CatchmentMatch {
  id: string;
  name: string;
  relation: "inside" | "boundary" | "outside";
  distanceToBoundaryMeters: number;
}

export interface CatchmentLookup {
  datasetId: "polyclinics";
  revision: string;
  catchments: CatchmentMatch[];
}

const METERS_PER_DEGREE = 111320;
const BOUNDARY_TOLERANCE_METERS = 0.001;

function polygons(feature: CatchmentFeature): Ring[][] {
  return feature.geometry.type === "Polygon"
    ? [feature.geometry.coordinates]
    : feature.geometry.coordinates;
}

/** Keep the legacy ray-cast tie-breaking for submission routing. */
function inRing(lng: number, lat: number, ring: Ring): boolean {
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

function contains(
  feature: CatchmentFeature,
  lat: number,
  lng: number,
): boolean {
  return polygons(feature).some(
    ([outer, ...holes]) =>
      inRing(lng, lat, outer) && !holes.some((hole) => inRing(lng, lat, hole)),
  );
}

function distanceToBoundary(
  feature: CatchmentFeature,
  lat: number,
  lng: number,
): number {
  // ponytail: local planar distances suit Barbados; use geodesic segments if coverage expands.
  const metersPerLongitude =
    METERS_PER_DEGREE * Math.cos((lat * Math.PI) / 180);
  let best = Infinity;
  for (const polygon of polygons(feature)) {
    for (const ring of polygon) {
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const [ax, ay] = ring[j];
        const [bx, by] = ring[i];
        const x = (lng - ax) * metersPerLongitude;
        const y = (lat - ay) * METERS_PER_DEGREE;
        const dx = (bx - ax) * metersPerLongitude;
        const dy = (by - ay) * METERS_PER_DEGREE;
        const lengthSquared = dx * dx + dy * dy;
        const t = lengthSquared
          ? Math.max(0, Math.min(1, (x * dx + y * dy) / lengthSquared))
          : 0;
        best = Math.min(best, Math.hypot(x - dx * t, y - dy * t));
      }
    }
  }
  return best;
}

@Injectable()
export class CatchmentGeometryService {
  readonly dataset: CatchmentDataset;
  readonly etag: string;

  constructor() {
    const file = path.resolve(__dirname, "polyclinic-catchments.geojson");
    const source = sourceSchema.parse(JSON.parse(readFileSync(file, "utf8")));
    const dataset = {
      type: source.type,
      datasetId: "polyclinics" as const,
      features: source.features,
    };
    const revision = createHash("sha256")
      .update(JSON.stringify(dataset))
      .digest("hex");
    this.dataset = { ...dataset, revision };
    this.etag = `"${revision}"`;
  }

  findContaining(lat: number, lng: number): CatchmentFeature | undefined {
    return this.dataset.features.find((feature) => contains(feature, lat, lng));
  }

  lookup({ lat, lng }: { lat: number; lng: number }): CatchmentLookup {
    return {
      datasetId: this.dataset.datasetId,
      revision: this.dataset.revision,
      catchments: this.dataset.features.map((feature) => {
        const distanceToBoundaryMeters = distanceToBoundary(feature, lat, lng);
        return {
          id: feature.id,
          name: feature.properties.name,
          relation:
            distanceToBoundaryMeters <= BOUNDARY_TOLERANCE_METERS
              ? "boundary"
              : contains(feature, lat, lng)
                ? "inside"
                : "outside",
          distanceToBoundaryMeters,
        };
      }),
    };
  }
}
