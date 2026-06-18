import { Logger } from "@nestjs/common";
import { createHmac } from "crypto";
import { WebhookProcessor } from "./webhook.processor";
import type { SubmissionCreatedEvent } from "../submissions.types";

const mockFetch = vi.fn();
global.fetch = mockFetch;

function makePayload(
  config: Record<string, unknown> = {},
): SubmissionCreatedEvent {
  return {
    submissionId: "sub-100",
    referenceCode: "PRM-20260604-130732-000100",
    formId: "permit-application",
    formVersion: "1.4.0",
    idempotencyKey: "idem-webhook-1",
    processors: [
      {
        type: "webhook",
        config: {
          url: "https://hooks.example.gov.bb/submissions",
          method: "POST",
          signatureHeader: "X-Webhook-Signature",
          timeoutMs: 10_000,
          ...config,
        },
      },
    ] as SubmissionCreatedEvent["processors"],
    values: { applicant: { firstName: "Sam", surname: "Lee" } },
    meta: {
      schemaVersion: 2,
      pinnedFormVersion: "1.4.0",
      draftId: "draft-100",
      activeStepIds: ["applicant"],
      hiddenStepIds: [],
      activeFieldIds: { applicant: ["firstName", "surname"] },
      hiddenFieldIds: {},
      visitedPages: [0],
      submittedAt: "2026-05-21T09:00:00.000Z",
    },
  };
}

describe("WebhookProcessor", () => {
  let processor: WebhookProcessor;

  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockResolvedValue({ ok: true, status: 200 });
    processor = new WebhookProcessor();
  });

  it("POSTs to the configured url with the configured method", async () => {
    await processor.process(makePayload({ method: "PUT" }));
    expect(mockFetch).toHaveBeenCalledWith(
      "https://hooks.example.gov.bb/submissions",
      expect.objectContaining({ method: "PUT" }),
    );
  });

  it("sends a versioned event envelope wrapping the submission data", async () => {
    await processor.process(makePayload());
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body).toMatchObject({
      event: "submission.created",
      version: "1",
      data: {
        submissionId: "sub-100",
        formId: "permit-application",
        formVersion: "1.4.0",
        values: { applicant: { firstName: "Sam", surname: "Lee" } },
        submittedAt: "2026-05-21T09:00:00.000Z",
      },
    });
    expect(typeof body.timestamp).toBe("string");
  });

  it("signs the exact body string when a secret is configured", async () => {
    const secret = "a-sufficiently-long-secret";
    await processor.process(makePayload({ secret }));
    const sentBody = mockFetch.mock.calls[0][1].body;
    const headers = mockFetch.mock.calls[0][1].headers;
    const expected =
      "sha256=" + createHmac("sha256", secret).update(sentBody).digest("hex");
    expect(headers["X-Webhook-Signature"]).toBe(expected);
  });

  it("omits the signature header when no secret is configured", async () => {
    await processor.process(makePayload());
    const headers = mockFetch.mock.calls[0][1].headers;
    expect(headers["X-Webhook-Signature"]).toBeUndefined();
  });

  it("uses the configured signatureHeader name", async () => {
    await processor.process(
      makePayload({
        secret: "a-sufficiently-long-secret",
        signatureHeader: "X-Sig",
      }),
    );
    expect(mockFetch.mock.calls[0][1].headers["X-Sig"]).toBeDefined();
  });

  it("sends X-Idempotency-Key keyed by submissionId and processorIndex", async () => {
    await processor.process(makePayload());
    expect(mockFetch.mock.calls[0][1].headers["X-Idempotency-Key"]).toBe(
      "sub-100:0",
    );
  });

  it("acts only on the entry at processorIndex, keyed with that index", async () => {
    const payload = makePayload();
    payload.processors = [
      { type: "webhook", config: { url: "https://first.example/hook" } },
      { type: "webhook", config: { url: "https://second.example/hook" } },
    ] as SubmissionCreatedEvent["processors"];
    payload.processorIndex = 1;

    await processor.process(payload);

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockFetch.mock.calls[0][0]).toBe("https://second.example/hook");
    expect(mockFetch.mock.calls[0][1].headers["X-Idempotency-Key"]).toBe(
      "sub-100:1",
    );
  });

  it("merges author-configured custom headers", async () => {
    await processor.process(
      makePayload({ headers: { "X-Tenant": "barbados" } }),
    );
    expect(mockFetch.mock.calls[0][1].headers["X-Tenant"]).toBe("barbados");
  });

  it("does not let custom headers override reserved headers", async () => {
    await processor.process(
      makePayload({ headers: { "X-Idempotency-Key": "spoofed" } }),
    );
    expect(mockFetch.mock.calls[0][1].headers["X-Idempotency-Key"]).toBe(
      "sub-100:0",
    );
  });

  it("skips and warns when no url is configured", async () => {
    const warn = vi
      .spyOn(Logger.prototype, "warn")
      .mockImplementation(() => {});
    const payload = makePayload();
    payload.processors = [
      { type: "webhook", config: {} },
    ] as SubmissionCreatedEvent["processors"];

    const result = await processor.process(payload);

    expect(mockFetch).not.toHaveBeenCalled();
    expect(result).toEqual({ kind: "completed" });
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("No url"));
    warn.mockRestore();
  });

  it("throws when the endpoint responds with a non-2xx status", async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 502 });
    await expect(processor.process(makePayload())).rejects.toThrow("HTTP 502");
  });

  it("passes an AbortSignal so the request can time out", async () => {
    await processor.process(makePayload());
    expect(mockFetch.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
  });

  it("returns { kind: 'completed' } on success", async () => {
    expect(await processor.process(makePayload())).toEqual({
      kind: "completed",
    });
  });
});

describe("WebhookProcessor — mapped mode", () => {
  let processor: WebhookProcessor;

  function makeMappedPayload(): SubmissionCreatedEvent {
    return {
      submissionId: "sub-200",
      referenceCode: "SCIENCE2026-2606-Y5RPJEP",
      formId: "science-camp",
      formVersion: "1.4.0",
      idempotencyKey: "idem-mapped-1",
      processors: [
        {
          type: "webhook",
          config: {
            endpoint: { env: "WEBHOOK_URL" },
            auth: {
              scheme: "apiKey",
              header: "X-API-Key",
              secretEnv: "WEBHOOK_SECRET",
            },
            mapping: {
              programmeCode: "SCIENCE2026",
              applicant: {
                name: ["child.first", "child.last"],
                email: "contact.email",
                phone: "contact.phone",
              },
              excludeSteps: ["declaration"],
            },
          },
        },
      ] as SubmissionCreatedEvent["processors"],
      values: {
        child: { first: "Ada", last: "Lovelace" },
        contact: { email: "p@example.bb", phone: "421-1234" },
        declaration: { agree: "confirmed" },
      },
      meta: {
        schemaVersion: 2,
        pinnedFormVersion: "1.4.0",
        draftId: "d",
        activeStepIds: [],
        hiddenStepIds: [],
        activeFieldIds: {},
        hiddenFieldIds: {},
        visitedPages: [0],
        submittedAt: "2026-06-18T09:00:00.000Z",
      } as unknown as SubmissionCreatedEvent["meta"],
    };
  }

  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockResolvedValue({ ok: true, status: 200 });
    processor = new WebhookProcessor();
    process.env.WEBHOOK_URL = "http://cms.local/api/cases";
    process.env.WEBHOOK_SECRET = "dev-key-123";
  });

  afterEach(() => {
    delete process.env.WEBHOOK_URL;
    delete process.env.WEBHOOK_SECRET;
  });

  it("POSTs the mapped case payload to the env endpoint with the API key", async () => {
    await processor.process(makeMappedPayload());
    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe("http://cms.local/api/cases");
    expect(init.headers["X-API-Key"]).toBe("dev-key-123");
    expect(JSON.parse(init.body)).toEqual({
      code: "SCIENCE2026-2606-Y5RPJEP",
      programme_code: "SCIENCE2026",
      applicant: {
        name: "Ada Lovelace",
        email: "p@example.bb",
        phone: "421-1234",
      },
      form_data: {},
      submitted_at: "2026-06-18T09:00:00.000Z",
    });
  });

  it("skips (no fetch) when the endpoint env var is unset", async () => {
    delete process.env.WEBHOOK_URL;
    const result = await processor.process(makeMappedPayload());
    expect(mockFetch).not.toHaveBeenCalled();
    expect(result).toEqual({ kind: "completed" });
  });

  it("skips when the apiKey secret env var is unset", async () => {
    delete process.env.WEBHOOK_SECRET;
    await processor.process(makeMappedPayload());
    expect(mockFetch).not.toHaveBeenCalled();
  });
});
