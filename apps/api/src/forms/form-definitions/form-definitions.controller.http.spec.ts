import { Test } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import request from "supertest";
import { FormDefinitionsController } from "./form-definitions.controller";
import { FormDefinitionsService } from "./form-definitions.service";
import { FormDisabledOverridesService } from "@/forms/form-disabled-overrides/form-disabled-overrides.service";
import { ContentService } from "@/content/content.service";
import { AppError } from "@/common/errors";
import { GlobalExceptionFilter } from "@/common/exception.filter";
import { ResponseInterceptor } from "@/common/response.interceptor";
import type { MetricsService } from "@/telemetry/metrics.service";

/**
 * Wire-level guard for GET /form-definitions/:formId (#3903). The unit spec
 * proves the handler calls `setHeader` before it can throw. This boots a
 * minimal app with the global filter and interceptor, and checks over real
 * HTTP that each response carries `Cache-Control: no-store`, the 410 and 404
 * error responses too. Minimal module, so it runs without a database.
 */
describe("GET /form-definitions/:formId — wire Cache-Control", () => {
  let app: INestApplication;
  const findByFormId = vi.fn();
  const find = vi.fn();

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [FormDefinitionsController],
      providers: [
        { provide: FormDefinitionsService, useValue: { findByFormId } },
        { provide: FormDisabledOverridesService, useValue: { find } },
        {
          provide: ConfigService,
          useValue: {
            get: (key: string) =>
              key === "RECIPE_PREVIEW_TOKEN" ? "s3cret" : "",
          },
        },
        {
          provide: ContentService,
          useValue: { categoryForForm: vi.fn().mockResolvedValue(undefined) },
        },
      ],
    }).compile();

    app = module.createNestApplication();
    app.useGlobalInterceptors(new ResponseInterceptor());
    app.useGlobalFilters(
      new GlobalExceptionFilter({
        recordValidationFailure: vi.fn(),
        recordHttpError: vi.fn(),
      } as unknown as MetricsService),
    );
    await app.init();
  });

  // Braces matter: Vitest runs a function returned from beforeEach as a
  // teardown, and mockReset() returns the mock itself.
  beforeEach(() => {
    find.mockReset();
    find.mockResolvedValue(null);
    findByFormId.mockReset();
    findByFormId.mockResolvedValue({ formId: "passport-renewal" });
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  const getForm = () =>
    request(app.getHttpServer()).get("/form-definitions/passport-renewal");

  it.each([
    ["public", {}, { bypassVisibility: false, draft: false }],
    [
      "preview",
      { "X-Recipe-Preview": "s3cret" },
      { bypassVisibility: true, draft: false },
    ],
    [
      "draft",
      { "X-Recipe-Draft": "s3cret" },
      { bypassVisibility: false, draft: true },
    ],
  ])("sends no-store on a %s 200", async (_kind, headers, flags) => {
    const res = await getForm().set(headers).expect(200);

    expect(findByFormId).toHaveBeenCalledWith({
      formId: "passport-renewal",
      ...flags,
    });
    expect(res.headers["cache-control"]).toBe("no-store");
  });

  it("sends no-store on the 410 for a disabled form", async () => {
    find.mockResolvedValue({ formId: "passport-renewal", reason: "Broken" });

    const res = await getForm().expect(410);

    expect(res.headers["cache-control"]).toBe("no-store");
  });

  it("sends no-store on the 404 for an unknown form", async () => {
    findByFormId.mockRejectedValue(
      AppError.notFound("Form definition", { formId: "passport-renewal" }),
    );

    const res = await getForm().expect(404);

    expect(res.headers["cache-control"]).toBe("no-store");
  });
});
