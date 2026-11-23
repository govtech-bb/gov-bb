import { Test } from "@nestjs/testing";
import { INestApplication, ServiceUnavailableException } from "@nestjs/common";
import request from "supertest";
import { ResponseInterceptor } from "@/common/response.interceptor";
import { SubmissionStatusController } from "./submission-status.controller";
import { SubmissionStatusService } from "./submission-status.service";

/**
 * Wire-level guard for GET /submissions/:reference/status (#3419): the chat
 * reads `data` from the envelope on a 200 and treats any non-2xx as "We cannot
 * check your application right now". Minimal module, as in
 * submissions.controller.http.spec.ts, so it runs without a database.
 */
describe("GET /submissions/:reference/status — wire", () => {
  let app: INestApplication;
  const lookup = vi.fn();

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [SubmissionStatusController],
      providers: [{ provide: SubmissionStatusService, useValue: { lookup } }],
    }).compile();

    app = module.createNestApplication();
    app.useGlobalInterceptors(new ResponseInterceptor());
    await app.init();
  });

  // Braces matter: Vitest runs a function returned from beforeEach as a
  // teardown, and mockReset() returns the mock itself.
  beforeEach(() => {
    lookup.mockReset();
  });

  afterAll(async () => {
    await app.close();
  });

  it("answers 200 with the lookup's answer as `data`", async () => {
    const answer = { kind: "not_found", reference: "MOH-TRL-2610-47E4AE6" };
    lookup.mockResolvedValue(answer);

    const res = await request(app.getHttpServer()).get(
      "/submissions/MOH-TRL-2610-47E4AE6/status",
    );

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual(answer);
    expect(lookup).toHaveBeenCalledWith("MOH-TRL-2610-47E4AE6");
  });

  // The chat sends the reference URL-encoded; the handler gets it decoded.
  it("passes the decoded reference to the lookup", async () => {
    lookup.mockResolvedValue({ kind: "not_found", reference: "A B/C" });

    await request(app.getHttpServer()).get("/submissions/A%20B%2FC/status");

    expect(lookup).toHaveBeenCalledWith("A B/C");
  });

  it("answers 503 when the status can't be worked out", async () => {
    lookup.mockRejectedValue(
      new ServiceUnavailableException("Application status is unavailable"),
    );

    const res = await request(app.getHttpServer()).get(
      "/submissions/MOH-TRL-2610-47E4AD6/status",
    );

    expect(res.status).toBe(503);
  });
});
