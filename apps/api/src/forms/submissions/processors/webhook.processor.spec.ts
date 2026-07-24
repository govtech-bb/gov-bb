import type { Mock } from "vitest";
import { Logger } from "@nestjs/common";
import type { HttpService } from "@nestjs/axios";
import { of } from "rxjs";
import { createHmac } from "crypto";

// SSRF guard (#287) resolves the webhook host before fetch; mock DNS so the
// default test host resolves to a public address and existing tests proceed.
vi.mock("node:dns/promises", () => ({ lookup: vi.fn() }));
import { lookup } from "node:dns/promises";

import { WebhookProcessor } from "./webhook.processor";
import { WebhookConfigError } from "./webhook-errors";
import type { WebhookDestinationsService } from "@/forms/webhook-destinations/webhook-destinations.service";
import type { SubmissionCreatedEvent } from "../submissions.types";

const request = vi.fn();
const http = { request } as unknown as HttpService;
const mockLookup = lookup as unknown as Mock;

/** A WebhookDestinationsService stub resolving to `dest` (or null = a miss). */
function makeDestinations(
  dest: { url: string; secret: string } | null,
): WebhookDestinationsService {
  return {
    resolveWebhookDestination: vi.fn().mockResolvedValue(dest),
  } as unknown as WebhookDestinationsService;
}

/** Single config object passed to HttpService.request for call `i`. */
function reqConfig(i = 0): {
  method: string;
  url: string;
  data: string;
  headers: Record<string, string>;
  timeout: number;
  maxRedirects: number;
} {
  return request.mock.calls[i][0];
}

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

describe("WebhookProcessor — generic (envelope) mode", () => {
  let processor: WebhookProcessor;

  beforeEach(() => {
    vi.clearAllMocks();
    request.mockReturnValue(of({ status: 200, data: {} }));
    mockLookup.mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);
    processor = new WebhookProcessor(http, makeDestinations(null));
  });

  it("POSTs to the configured url with the configured method", async () => {
    await processor.process(makePayload({ method: "PUT" }));
    expect(reqConfig().method).toBe("PUT");
    expect(reqConfig().url).toBe("https://hooks.example.gov.bb/submissions");
  });

  it("sends a versioned event envelope wrapping the submission data", async () => {
    await processor.process(makePayload());
    const body = JSON.parse(reqConfig().data);
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
    const sentBody = reqConfig().data;
    const headers = reqConfig().headers;
    const expected =
      "sha256=" + createHmac("sha256", secret).update(sentBody).digest("hex");
    expect(headers["X-Webhook-Signature"]).toBe(expected);
  });

  it("omits the signature header when no secret is configured", async () => {
    await processor.process(makePayload());
    const headers = reqConfig().headers;
    expect(headers["X-Webhook-Signature"]).toBeUndefined();
  });

  it("uses the configured signatureHeader name", async () => {
    await processor.process(
      makePayload({
        secret: "a-sufficiently-long-secret",
        signatureHeader: "X-Sig",
      }),
    );
    expect(reqConfig().headers["X-Sig"]).toBeDefined();
  });

  it("sends X-Idempotency-Key keyed by submissionId and processorIndex", async () => {
    await processor.process(makePayload());
    expect(reqConfig().headers["X-Idempotency-Key"]).toBe("sub-100:0");
  });

  it("acts only on the entry at processorIndex, keyed with that index", async () => {
    const payload = makePayload();
    payload.processors = [
      { type: "webhook", config: { url: "https://first.example/hook" } },
      { type: "webhook", config: { url: "https://second.example/hook" } },
    ] as SubmissionCreatedEvent["processors"];
    payload.processorIndex = 1;

    await processor.process(payload);

    expect(request).toHaveBeenCalledTimes(1);
    expect(reqConfig().url).toBe("https://second.example/hook");
    expect(reqConfig().headers["X-Idempotency-Key"]).toBe("sub-100:1");
  });

  it("merges author-configured custom headers", async () => {
    await processor.process(
      makePayload({ headers: { "X-Tenant": "barbados" } }),
    );
    expect(reqConfig().headers["X-Tenant"]).toBe("barbados");
  });

  it("does not let custom headers override reserved headers", async () => {
    await processor.process(
      makePayload({ headers: { "X-Idempotency-Key": "spoofed" } }),
    );
    expect(reqConfig().headers["X-Idempotency-Key"]).toBe("sub-100:0");
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

    expect(request).not.toHaveBeenCalled();
    expect(result).toEqual({ kind: "completed" });
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("No url"));
    warn.mockRestore();
  });

  it("rejects an internal-IP url and never fetches (SSRF guard, #287)", async () => {
    const payload = makePayload();
    payload.processors = [
      {
        type: "webhook",
        config: {
          url: "https://169.254.169.254/latest/meta-data/iam/security-credentials/role",
        },
      },
    ] as SubmissionCreatedEvent["processors"];

    await expect(processor.process(payload)).rejects.toThrow();
    expect(request).not.toHaveBeenCalled();
  });

  it("rejects a non-https url and never fetches (SSRF guard, #287)", async () => {
    const payload = makePayload();
    payload.processors = [
      { type: "webhook", config: { url: "http://hooks.example.gov.bb/x" } },
    ] as SubmissionCreatedEvent["processors"];

    await expect(processor.process(payload)).rejects.toThrow();
    expect(request).not.toHaveBeenCalled();
  });

  it("rejects a host that resolves to a private IP and never fetches (#287)", async () => {
    mockLookup.mockResolvedValue([{ address: "10.0.0.5", family: 4 }]);
    await expect(processor.process(makePayload())).rejects.toThrow();
    expect(request).not.toHaveBeenCalled();
  });

  it("disables redirect-following on the outbound request (SSRF via redirect, #287)", async () => {
    await processor.process(makePayload());
    expect(reqConfig().maxRedirects).toBe(0);
  });

  it("throws when the endpoint responds with a non-2xx status", async () => {
    request.mockReturnValue(of({ status: 502, data: {} }));
    await expect(processor.process(makePayload())).rejects.toThrow("HTTP 502");
  });

  it("applies the configured timeout so the request can time out", async () => {
    await processor.process(makePayload({ timeoutMs: 5_000 }));
    expect(reqConfig().timeout).toBe(5_000);
  });

  it("returns { kind: 'completed' } on success", async () => {
    expect(await processor.process(makePayload())).toEqual({
      kind: "completed",
    });
  });
});

describe("WebhookProcessor — mapped mode (per-MDA destination)", () => {
  const DEST = {
    url: "https://cms.example.gov.bb/api/cases",
    secret: "dev-key-123",
  };

  function makeMappedPayload(): SubmissionCreatedEvent {
    return {
      submissionId: "sub-200",
      referenceCode: "PRM-20260604-130732-000200",
      formId: "science-camp",
      formVersion: "1.4.0",
      idempotencyKey: "idem-mapped-1",
      processors: [
        {
          type: "webhook",
          config: {
            // A mapped webhook carries NO destination — it resolves per-MDA.
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
        submittedAt: "2026-06-18T09:00:00.000Z",
      } as unknown as SubmissionCreatedEvent["meta"],
    };
  }

  beforeEach(() => {
    vi.clearAllMocks();
    request.mockReturnValue(of({ status: 200, data: {} }));
    mockLookup.mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);
  });

  it("resolves the destination by formId and POSTs the mapped payload with X-API-Key", async () => {
    const destinations = makeDestinations(DEST);
    const processor = new WebhookProcessor(http, destinations);

    await processor.process(makeMappedPayload());

    expect(destinations.resolveWebhookDestination).toHaveBeenCalledWith(
      "science-camp",
    );
    expect(reqConfig().url).toBe(DEST.url);
    expect(reqConfig().headers["X-API-Key"]).toBe("dev-key-123");
    expect(JSON.parse(reqConfig().data)).toEqual({
      code: "PRM-20260604-130732-000200",
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

  it("fails loud (WebhookConfigError, no request) when no MDA destination resolves", async () => {
    const processor = new WebhookProcessor(http, makeDestinations(null));
    await expect(processor.process(makeMappedPayload())).rejects.toBeInstanceOf(
      WebhookConfigError,
    );
    expect(request).not.toHaveBeenCalled();
  });

  it("applies the SSRF guard to the resolved destination url (#287)", async () => {
    const processor = new WebhookProcessor(
      http,
      makeDestinations({ url: "https://10.0.0.5/api", secret: "k" }),
    );
    mockLookup.mockResolvedValue([{ address: "10.0.0.5", family: 4 }]);
    await expect(processor.process(makeMappedPayload())).rejects.toThrow();
    expect(request).not.toHaveBeenCalled();
  });
});

describe("WebhookProcessor — generic endpoint/auth branches", () => {
  let processor: WebhookProcessor;

  function payloadWith(
    config: Record<string, unknown>,
  ): SubmissionCreatedEvent {
    return {
      submissionId: "sub-300",
      referenceCode: "REF-1",
      formId: "f",
      formVersion: "1.0.0",
      idempotencyKey: "idem-300",
      processors: [
        { type: "webhook", config },
      ] as SubmissionCreatedEvent["processors"],
      values: { s: { a: "1" } },
      meta: {
        submittedAt: "2026-06-18T09:00:00.000Z",
      } as unknown as SubmissionCreatedEvent["meta"],
    };
  }

  beforeEach(() => {
    vi.clearAllMocks();
    request.mockReturnValue(of({ status: 200, data: {} }));
    mockLookup.mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);
    processor = new WebhookProcessor(http, makeDestinations(null));
    process.env.WEBHOOK_URL = "http://cms.local";
  });
  afterEach(() => {
    delete process.env.WEBHOOK_URL;
  });

  it("resolves endpoint base + path (env-sourced, exempt from SSRF)", async () => {
    await processor.process(
      payloadWith({
        endpoint: { env: "WEBHOOK_URL", path: "api/cases" },
        auth: { scheme: "none" },
      }),
    );
    expect(reqConfig().url).toBe("http://cms.local/api/cases");
  });

  it("hmac auth sets the signature header", async () => {
    await processor.process(
      payloadWith({
        url: "https://h.example.gov.bb/x",
        auth: {
          scheme: "hmac",
          secret: "supersecretsupersecret",
          signatureHeader: "X-Sig",
        },
      }),
    );
    expect(reqConfig().headers["X-Sig"]).toMatch(/^sha256=/);
  });

  it("none auth sends no auth header", async () => {
    await processor.process(
      payloadWith({
        url: "https://h.example.gov.bb/x",
        auth: { scheme: "none" },
      }),
    );
    const h = reqConfig().headers;
    expect(h["X-API-Key"]).toBeUndefined();
    expect(h["X-Webhook-Signature"]).toBeUndefined();
  });

  it("skips (no request) when the endpoint env var is unset", async () => {
    delete process.env.WEBHOOK_URL;
    const result = await processor.process(
      payloadWith({
        endpoint: { env: "WEBHOOK_URL" },
        auth: { scheme: "none" },
      }),
    );
    expect(request).not.toHaveBeenCalled();
    expect(result).toEqual({ kind: "completed" });
  });

  it("skips (no request) when the apiKey secret env var is unset", async () => {
    const result = await processor.process(
      payloadWith({
        url: "https://h.example.gov.bb/x",
        auth: {
          scheme: "apiKey",
          header: "X-API-Key",
          secretEnv: "MISSING_KEY",
        },
      }),
    );
    expect(request).not.toHaveBeenCalled();
    expect(result).toEqual({ kind: "completed" });
  });
});
