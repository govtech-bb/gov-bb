import * as fs from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CatchmentGeometryService,
  type CatchmentFeature,
} from "./catchment-geometry.service";

vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  return { ...actual, readFileSync: vi.fn(actual.readFileSync) };
});

afterEach(() => vi.clearAllMocks());

const square = (
  west: number,
  south: number,
  east: number,
  north: number,
): [number, number][] => [
  [west, south],
  [west, north],
  [east, north],
  [east, south],
  [west, south],
];
const feature = (
  id: string,
  coordinates = [square(-1, -1, 1, 1)],
): CatchmentFeature => ({
  type: "Feature",
  id,
  properties: { name: id },
  geometry: { type: "Polygon", coordinates },
});
const source = (...features: CatchmentFeature[]) => ({
  type: "FeatureCollection",
  features,
});
function load(data: unknown): CatchmentGeometryService {
  vi.mocked(fs.readFileSync).mockReturnValueOnce(JSON.stringify(data));
  return new CatchmentGeometryService();
}

describe("CatchmentGeometryService", () => {
  it("returns every catchment in source order, preserving overlapping hits and legacy first-match behavior", () => {
    const svc = load(
      source(
        feature("first"),
        feature("overlap"),
        feature("outside", [square(2, 2, 3, 3)]),
      ),
    );
    const result = svc.lookup({ lat: 0, lng: 0 });
    expect(result).toEqual({
      datasetId: "polyclinics",
      revision: svc.dataset.revision,
      catchments: [
        {
          id: "first",
          name: "first",
          relation: "inside",
          distanceToBoundaryMeters: 111320,
        },
        {
          id: "overlap",
          name: "overlap",
          relation: "inside",
          distanceToBoundaryMeters: 111320,
        },
        {
          id: "outside",
          name: "outside",
          relation: "outside",
          distanceToBoundaryMeters: Math.hypot(222640, 222640),
        },
      ],
    });
    expect(svc.findContaining(0, 0)?.id).toBe("first");
    expect(svc.findContaining(5, 5)).toBeUndefined();
    expect(
      svc
        .lookup({ lat: 5, lng: 5 })
        .catchments.every((match) => match.relation === "outside"),
    ).toBe(true);
    expect(fs.readFileSync).toHaveBeenCalledTimes(1);
  });

  it("excludes holes from containment and measures distance to their edges", () => {
    const svc = load(
      source(
        feature("with-hole", [
          square(-1, -1, 1, 1),
          square(-0.5, -0.5, 0.5, 0.5),
        ]),
      ),
    );
    expect(svc.findContaining(0, 0)).toBeUndefined();
    expect(svc.lookup({ lat: 0, lng: 0 }).catchments[0]).toMatchObject({
      relation: "outside",
      distanceToBoundaryMeters: 55660,
    });
    expect(svc.lookup({ lat: 0, lng: 0.5 }).catchments[0]).toMatchObject({
      relation: "boundary",
      distanceToBoundaryMeters: 0,
    });
    expect(svc.findContaining(0, 0.9)?.id).toBe("with-hole");
    expect(svc.lookup({ lat: 0, lng: 0.9 }).catchments[0].relation).toBe(
      "inside",
    );
  });

  it("includes every MultiPolygon component with latitude/longitude in their correct order", () => {
    const multi: CatchmentFeature = {
      ...feature("multi"),
      geometry: {
        type: "MultiPolygon",
        coordinates: [[square(-60, 12, -59, 13)], [square(-59, 13, -58, 14)]],
      },
    };
    const svc = load(source(multi));
    expect(svc.findContaining(12.5, -59.5)?.id).toBe("multi");
    expect(svc.findContaining(13.5, -58.5)?.id).toBe("multi");
    expect(svc.findContaining(-58.5, 13.5)).toBeUndefined();
    expect(
      svc.lookup({ lat: 13.5, lng: -58.5 }).catchments[0]
        .distanceToBoundaryMeters,
    ).toBeCloseTo(0.5 * 111320 * Math.cos((13.5 * Math.PI) / 180), 6);
  });

  it("reports both sides of shared edges and vertices, without changing legacy boundary tie-breaking", () => {
    const svc = load(
      source(
        feature("left", [square(-1, -1, 0, 1)]),
        feature("right", [square(0, -1, 1, 1)]),
      ),
    );
    for (const lat of [0, 1]) {
      expect(
        svc
          .lookup({ lat, lng: 0 })
          .catchments.map(({ relation, distanceToBoundaryMeters }) => ({
            relation,
            distanceToBoundaryMeters,
          })),
      ).toEqual([
        { relation: "boundary", distanceToBoundaryMeters: 0 },
        { relation: "boundary", distanceToBoundaryMeters: 0 },
      ]);
    }
    expect(svc.findContaining(0, 0)?.id).toBe("right");
    expect(svc.findContaining(1, 0)).toBeUndefined();
  });

  it("uses only millimeter numerical tolerance and keeps submeter distance precision", () => {
    const svc = load(source(feature("right", [square(0, -1, 1, 1)])));
    for (const [meters, relation] of [
      [-0.0005, "boundary"],
      [0.0005, "boundary"],
      [-0.002, "outside"],
      [0.002, "inside"],
      [150, "inside"],
    ] as const) {
      const result = svc.lookup({ lat: 0, lng: meters / 111320 }).catchments[0];
      expect(result.relation).toBe(relation);
      expect(result.distanceToBoundaryMeters).toBeCloseTo(Math.abs(meters), 6);
    }
  });

  it("handles repeated vertices and zero-length segments without producing NaN", () => {
    const ring = square(0, 0, 1, 1);
    ring.splice(1, 0, [0, 0]);
    const svc = load(source(feature("repeated", [ring])));
    expect(
      svc.lookup({ lat: -1, lng: -1 }).catchments[0].distanceToBoundaryMeters,
    ).toBeCloseTo(Math.hypot(111320 * Math.cos(Math.PI / 180), 111320), 6);
    expect(
      svc.lookup({ lat: 0, lng: 0 }).catchments[0].distanceToBoundaryMeters,
    ).toBe(0);
  });

  it("sanitizes the public dataset and hashes only its deterministic public content", () => {
    const clean = load(source(feature("a")));
    const extra = {
      ...source(feature("a")),
      note: "internal",
      crs: { name: "old" },
      features: [
        {
          ...feature("a"),
          internal: "secret",
          properties: { name: "a", phone: "123", programmeCode: "CAMS" },
          geometry: { ...feature("a").geometry, internal: "secret" },
        },
      ],
    };
    const sanitized = load(extra);
    expect(sanitized.dataset).toEqual(clean.dataset);
    expect(sanitized.etag).toBe(`"${sanitized.dataset.revision}"`);
    expect(sanitized.dataset.revision).toMatch(/^[a-f0-9]{64}$/);
    expect(Object.keys(sanitized.dataset).sort()).toEqual([
      "datasetId",
      "features",
      "revision",
      "type",
    ]);
    expect(sanitized.dataset.features).toEqual([feature("a")]);
    const reordered = load({
      features: [
        {
          geometry: feature("a").geometry,
          properties: { name: "a" },
          id: "a",
          type: "Feature",
        },
      ],
      type: "FeatureCollection",
    });
    expect(reordered.dataset.revision).toBe(clean.dataset.revision);
    expect(load(source(feature("changed-id"))).dataset.revision).not.toBe(
      clean.dataset.revision,
    );
    expect(
      load(source({ ...feature("a"), properties: { name: "Changed name" } }))
        .dataset.revision,
    ).not.toBe(clean.dataset.revision);
    expect(
      load(source(feature("a", [square(-1, -1, 1, 2)]))).dataset.revision,
    ).not.toBe(clean.dataset.revision);
  });

  it("preserves self-intersections instead of repairing source geometry", () => {
    const bowtie = feature("crossing", [
      [
        [-1, -1],
        [1, 1],
        [-1, 1],
        [1, -1],
        [-1, -1],
      ],
    ]);
    expect(load(source(bowtie)).dataset.features).toEqual([bowtie]);
  });

  it.each([
    ["collection type", { ...source(feature("a")), type: "Feature" }],
    ["empty collection", source()],
    [
      "missing feature type",
      {
        type: "FeatureCollection",
        features: [{ ...feature("a"), type: undefined }],
      },
    ],
    [
      "missing id",
      {
        type: "FeatureCollection",
        features: [{ ...feature("a"), id: undefined }],
      },
    ],
    ["empty name", source({ ...feature("a"), properties: { name: "" } })],
    [
      "duplicate id",
      source(feature("a"), { ...feature("a"), properties: { name: "b" } }),
    ],
    [
      "duplicate name",
      source(feature("a"), { ...feature("b"), properties: { name: "a" } }),
    ],
    [
      "unsupported geometry",
      {
        type: "FeatureCollection",
        features: [
          { ...feature("a"), geometry: { type: "Point", coordinates: [0, 0] } },
        ],
      },
    ],
    ["empty polygon", source(feature("a", []))],
    ["empty ring", source(feature("a", [[]]))],
    [
      "short ring",
      source(
        feature("a", [
          [
            [0, 0],
            [1, 1],
            [0, 0],
          ],
        ]),
      ),
    ],
    [
      "open ring",
      source(
        feature("a", [
          [
            [0, 0],
            [1, 1],
            [1, 0],
            [0, 1],
          ],
        ]),
      ),
    ],
    ["invalid longitude", source(feature("a", [square(-181, -1, 1, 1)]))],
    ["invalid latitude", source(feature("a", [square(-1, -91, 1, 1)]))],
    ["non-finite coordinate", source(feature("a", [square(NaN, -1, 1, 1)]))],
  ])("rejects invalid source structure: %s", (_reason, data) => {
    expect(() => load(data)).toThrow();
  });

  it("loads all eight canonical catchments without exposing contacts or applying redirects", () => {
    const svc = new CatchmentGeometryService();
    expect(svc.dataset.features).toHaveLength(8);
    expect(
      svc.dataset.features.every(
        ({ properties }) => Object.keys(properties).join() === "name",
      ),
    ).toBe(true);
    expect(svc.findContaining(13.1323, -59.5626)?.properties.name).toBe(
      "Frederick Miller Polyclinic",
    );
    expect(
      svc
        .lookup({ lat: 13.1323, lng: -59.5626 })
        .catchments.find(({ name }) => name === "Frederick Miller Polyclinic")
        ?.relation,
    ).toBe("inside");
  });
});
