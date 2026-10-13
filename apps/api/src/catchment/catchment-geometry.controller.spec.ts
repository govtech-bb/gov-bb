import { Logger, ValidationPipe, type INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import request from "supertest";
import { GlobalExceptionFilter } from "../common/exception.filter";
import { ResponseInterceptor } from "../common/response.interceptor";
import type { MetricsService } from "../telemetry/metrics.service";
import { CatchmentGeometryModule } from "./catchment-geometry.module";
import type { CatchmentLookup } from "./catchment-geometry.service";

const endpoint = "/catchments/polyclinics";
const point = { lat: 13.1323, lng: -59.5626 };

describe("public catchment HTTP API", () => {
  let app: INestApplication;

  beforeAll(async () => {
    // This module must boot without forms, CAMS configuration or a database.
    const module = await Test.createTestingModule({
      imports: [CatchmentGeometryModule],
    }).compile();
    app = module.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }),
    );
    app.useGlobalInterceptors(new ResponseInterceptor());
    app.useGlobalFilters(
      new GlobalExceptionFilter({
        recordValidationFailure: vi.fn(),
        recordHttpError: vi.fn(),
      } as unknown as MetricsService),
    );
    await app.init();
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  it("serves raw GeoJSON and uses the same revision for every lookup", async () => {
    const map = await request(app.getHttpServer()).get(endpoint).expect(200);
    expect(map.headers["content-type"]).toMatch(/^application\/geo\+json/);
    expect(map.headers["cache-control"]).toBe(
      "public, max-age=0, must-revalidate",
    );
    expect(map.headers.etag).toBe(`"${map.body.revision}"`);
    expect(map.body).toMatchObject({
      type: "FeatureCollection",
      datasetId: "polyclinics",
    });
    expect(map.body.features).toHaveLength(8);
    for (const feature of map.body.features) {
      expect(Object.keys(feature).sort()).toEqual([
        "geometry",
        "id",
        "properties",
        "type",
      ]);
      expect(Object.keys(feature.properties)).toEqual(["name"]);
    }

    const lookup = await request(app.getHttpServer())
      .post(`${endpoint}/lookup`)
      .send(point)
      .expect(200);
    const body = lookup.body as CatchmentLookup;
    expect(lookup.headers["cache-control"]).toBe("no-store");
    expect(Object.keys(body).sort()).toEqual([
      "catchments",
      "datasetId",
      "revision",
    ]);
    expect(body.revision).toBe(map.body.revision);
    expect(body.catchments.map((c) => c.id)).toEqual(
      map.body.features.map((f: { id: string }) => f.id),
    );
    expect(
      body.catchments.filter((c) => c.relation === "inside").map((c) => c.id),
    ).toEqual(["frederick-miller"]);
    for (const catchment of body.catchments) {
      expect(Object.keys(catchment).sort()).toEqual([
        "distanceToBoundaryMeters",
        "id",
        "name",
        "relation",
      ]);
      expect(Number.isFinite(catchment.distanceToBoundaryMeters)).toBe(true);
      expect(catchment.distanceToBoundaryMeters).toBeGreaterThanOrEqual(0);
    }
  });

  it("revalidates ETags, including weak validators, lists and wildcards", async () => {
    const first = await request(app.getHttpServer()).get(endpoint).expect(200);
    for (const validator of [
      first.headers.etag,
      `W/${first.headers.etag}`,
      `"old", ${first.headers.etag}`,
      "*",
    ]) {
      const cached = await request(app.getHttpServer())
        .get(endpoint)
        .set("If-None-Match", validator)
        .expect(304);
      expect(cached.text).toBe("");
      expect(cached.headers.etag).toBe(first.headers.etag);
      expect(cached.headers["cache-control"]).toBe(
        "public, max-age=0, must-revalidate",
      );
    }
    await request(app.getHttpServer())
      .get(endpoint)
      .set("If-None-Match", '"old"')
      .expect(200);
  });

  it("leaves offshore coordinates outside rather than selecting a clinic", async () => {
    const { body } = await request(app.getHttpServer())
      .post(`${endpoint}/lookup`)
      .send({ lat: 13.5, lng: -60.5 })
      .expect(200);
    expect(body.catchments).toHaveLength(8);
    expect(
      body.catchments.every(
        (c: { relation: string }) => c.relation === "outside",
      ),
    ).toBe(true);
  });

  it.each(
    [
      {},
      { lat: 13.1 },
      { lng: -59.6 },
      { lat: "13.1", lng: -59.6 },
      { lat: 13.1, lng: "-59.6" },
      { lat: "", lng: -59.6 },
      { lat: null, lng: -59.6 },
      { lat: true, lng: -59.6 },
      { lat: [13.1], lng: -59.6 },
      { lat: 91, lng: -59.6 },
      { lat: -91, lng: -59.6 },
      { lat: 13.1, lng: 181 },
      { lat: 13.1, lng: -181 },
      { ...point, parish: "st-george" },
      { ...point, programmeCode: "ENV_HEALTH_OFFICER" },
      [],
      null,
    ].map((body) => [body]),
  )("rejects invalid lookup input: %j", async (body) => {
    const log = vi
      .spyOn(Logger.prototype, "error")
      .mockImplementation(() => {});
    try {
      const res = await request(app.getHttpServer())
        .post(`${endpoint}/lookup`)
        .set("Content-Type", "application/json")
        .send(JSON.stringify(body))
        .expect(400);
      expect(res.body).toMatchObject({ status: "failed", statusCode: 400 });
    } finally {
      log.mockRestore();
    }
  });

  it("rejects a JSON number that overflows to infinity", async () => {
    const log = vi
      .spyOn(Logger.prototype, "error")
      .mockImplementation(() => {});
    try {
      await request(app.getHttpServer())
        .post(`${endpoint}/lookup`)
        .set("Content-Type", "application/json")
        .send('{"lat":1e400,"lng":-59.6}')
        .expect(400);
    } finally {
      log.mockRestore();
    }
  });

  it("documents the public endpoints and required numeric coordinate fields", () => {
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder().build(),
    );
    expect(document.paths[endpoint].get?.responses["200"]).toHaveProperty(
      "content.application/geo+json",
    );
    expect(document.paths[`${endpoint}/lookup`].post?.responses).toHaveProperty(
      "200",
    );
    expect(document.components?.schemas?.CatchmentLookupDto).toMatchObject({
      required: ["lat", "lng"],
      properties: {
        lat: { type: "number", minimum: -90, maximum: 90 },
        lng: { type: "number", minimum: -180, maximum: 180 },
      },
    });
  });
});
