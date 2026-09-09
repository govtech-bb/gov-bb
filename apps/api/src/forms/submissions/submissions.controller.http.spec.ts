import { Test } from "@nestjs/testing";
import { HttpStatus, INestApplication } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import request from "supertest";
import { SubmissionsController } from "./submissions.controller";
import { SubmissionsService } from "./submissions.service";
import { SubmissionPayloadSizePipe } from "./submission-payload-size.pipe";
import { ResponseInterceptor } from "@/common/response.interceptor";
import { FormSubmissionStatus } from "@/database/entities/form-submission.entity";
import { makeSubmissionEntity as makeEntity } from "./__fixtures__/form-submission";
import type { SubmitResult } from "./submissions.types";

/**
 * Wire-level guard for POST /submissions (#2365, split from #2338).
 *
 * The unit spec (submissions.controller.spec.ts) asserts the returned *object's*
 * statusCode; it never boots an app, so it can't see the actual HTTP status.
 * The status only reaches the wire because the global ResponseInterceptor maps
 * `body.statusCode` onto `res.status(...)`. This test boots a minimal app WITH
 * that interceptor and asserts, over real HTTP, that each idempotency outcome
 * lands the right status — and that the wire status and the body field agree
 * (the "must not disagree" property from #2338).
 *
 * Deliberately a minimal module (mocked service + config, no AppModule/DB) so it
 * runs in CI, unlike file-upload.integration.spec.ts which needs a live Postgres.
 */

const validBody = {
  formId: "test-form",
  formVersion: "1.0.0",
  values: { "step-1": { field1: "value1" } },
};

describe("POST /submissions — wire HTTP status", () => {
  let app: INestApplication;
  const submit = vi.fn();

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [SubmissionsController],
      providers: [
        { provide: SubmissionsService, useValue: { submit } },
        // Non-smoke, no bypass: every config lookup returns "".
        { provide: ConfigService, useValue: { get: () => "" } },
        SubmissionPayloadSizePipe,
      ],
    }).compile();

    app = module.createNestApplication();
    // The behaviour under test: this interceptor is what carries the computed
    // statusCode to the wire (main.ts registers it the same way).
    app.useGlobalInterceptors(new ResponseInterceptor());
    await app.init();
  });

  beforeEach(() => {
    submit.mockReset();
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  const post = () =>
    request(app.getHttpServer())
      .post("/submissions")
      .set("idempotency-key", "key-abc")
      .send(validBody);

  it("returns 201 for a new submission", async () => {
    submit.mockResolvedValue({
      outcome: "created",
      data: makeEntity(),
      message: "Submission created",
      statusCode: HttpStatus.CREATED,
    } satisfies SubmitResult);

    const res = await post();

    expect(res.status).toBe(201);
    expect(res.body.statusCode).toBe(201);
  });

  it("returns 200 for an idempotent replay of a completed submission", async () => {
    submit.mockResolvedValue({
      outcome: "duplicate",
      data: makeEntity(),
      message: "Submission already exists",
      statusCode: HttpStatus.OK,
    } satisfies SubmitResult);

    const res = await post();

    expect(res.status).toBe(200);
    expect(res.body.statusCode).toBe(200);
  });

  it("returns 202 for a replay while the original is still processing", async () => {
    submit.mockResolvedValue({
      outcome: "in_progress",
      data: makeEntity({ status: FormSubmissionStatus.PROCESSING }),
      message: "Submission is currently being processed",
      statusCode: HttpStatus.ACCEPTED,
    } satisfies SubmitResult);

    const res = await post();

    expect(res.status).toBe(202);
    expect(res.body.statusCode).toBe(202);
  });
});
