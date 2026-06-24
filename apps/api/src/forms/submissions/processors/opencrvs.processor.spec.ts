import { Logger } from "@nestjs/common";
import type { HttpService } from "@nestjs/axios";
import { of } from "rxjs";
import { OpencrvsProcessor } from "./opencrvs.processor";
import type { SubmissionCreatedEvent } from "../submissions.types";

const request = vi.fn();
const http = { request } as unknown as HttpService;

/** Single config object passed to HttpService.request for call `i`. */
function reqConfig(i = 0): {
  method: string;
  url: string;
  data: string;
  headers: Record<string, string>;
  timeout: number;
} {
  return request.mock.calls[i][0];
}

function makePayload(
  processorConfig: Record<string, string> = {},
): SubmissionCreatedEvent {
  return {
    submissionId: "sub-002",
    referenceCode: "BRT-20260604-130732-000001",
    formId: "birth-registration",
    formVersion: "2.0.0",
    idempotencyKey: "idem-opencrvs-1",
    processors: [
      {
        type: "opencrvs",
        config: {
          endpoint: "https://opencrvs.example.gov.bb/api/submit",
          ...processorConfig,
        },
      },
    ],
    values: { applicant: { firstName: "Jane", surname: "Doe" } },
    meta: {
      schemaVersion: 1,
      pinnedFormVersion: "2.0.0",
      draftId: "draft-002",
      activeStepIds: ["applicant"],
      hiddenStepIds: [],
      activeFieldIds: { applicant: ["firstName", "surname"] },
      hiddenFieldIds: {},
      visitedPages: [0],
      submittedAt: "2026-04-29T10:00:00.000Z",
    },
  };
}

describe("OpencrvsProcessor", () => {
  let processor: OpencrvsProcessor;

  beforeEach(() => {
    vi.clearAllMocks();
    request.mockReturnValue(of({ status: 200, data: {} }));
    processor = new OpencrvsProcessor(http);
  });

  describe("process", () => {
    it("POSTs submission data to the configured endpoint", async () => {
      await processor.process(makePayload());

      expect(reqConfig().method).toBe("POST");
      expect(reqConfig().url).toBe(
        "https://opencrvs.example.gov.bb/api/submit",
      );
    });

    it("includes submissionId, formId, formVersion, values, and submittedAt in the body", async () => {
      await processor.process(makePayload());

      const body = JSON.parse(reqConfig().data);
      expect(body).toMatchObject({
        submissionId: "sub-002",
        formId: "birth-registration",
        formVersion: "2.0.0",
        values: { applicant: { firstName: "Jane", surname: "Doe" } },
        submittedAt: "2026-04-29T10:00:00.000Z",
      });
    });

    it("sets X-Idempotency-Key header derived from submissionId for retry safety", async () => {
      await processor.process(makePayload());

      const headers = reqConfig().headers;
      // Format is "<submissionId>:<index>" so multi-entry retries don't collide.
      expect(headers["X-Idempotency-Key"]).toBe("sub-002:0");
    });

    it("applies a request timeout", async () => {
      await processor.process(makePayload());

      expect(reqConfig().timeout).toBeGreaterThan(0);
    });

    it("includes Authorization header when token is configured", async () => {
      await processor.process(makePayload({ token: "secret-token" }));

      const headers = reqConfig().headers;
      expect(headers["Authorization"]).toBe("Bearer secret-token");
    });

    it("omits Authorization header when no token is configured", async () => {
      await processor.process(makePayload());

      const headers = reqConfig().headers;
      expect(headers["Authorization"]).toBeUndefined();
    });

    it("skips and warns when no endpoint is configured", async () => {
      const warn = vi
        .spyOn(Logger.prototype, "warn")
        .mockImplementation(() => {});
      const payload = makePayload();
      payload.processors = [{ type: "opencrvs", config: {} }];

      await processor.process(payload);

      expect(request).not.toHaveBeenCalled();
      expect(warn).toHaveBeenCalledWith(expect.stringContaining("No endpoint"));
      warn.mockRestore();
    });

    it("throws when the endpoint responds with a non-OK status", async () => {
      request.mockReturnValue(of({ status: 503, data: {} }));

      await expect(processor.process(makePayload())).rejects.toThrow(
        "HTTP 503",
      );
    });

    it("acts only on the entry at processorIndex, ignoring siblings", async () => {
      // Per-entry dispatch: each message addresses one entry by index. This
      // invocation targets index 1, so only the secondary endpoint is POSTed.
      const payload = makePayload();
      payload.processors = [
        {
          type: "opencrvs",
          config: { endpoint: "https://primary.example/api/submit" },
        },
        {
          type: "opencrvs",
          config: { endpoint: "https://secondary.example/api/submit" },
        },
      ];
      payload.processorIndex = 1;

      await processor.process(payload);

      expect(request).toHaveBeenCalledTimes(1);
      expect(reqConfig().url).toBe("https://secondary.example/api/submit");
    });

    it("is a no-op when no entry exists at processorIndex (defensive guard)", async () => {
      // Per-entry dispatch never invokes us without a matching entry, but a
      // corrupted/out-of-range index should be a no-op, not a throw.
      const payload = makePayload();
      payload.processors = [];

      const result = await processor.process(payload);

      expect(result).toEqual({ kind: "completed" });
      expect(request).not.toHaveBeenCalled();
    });

    it("keys X-Idempotency-Key with the addressed index so per-entry retries don't collide", async () => {
      const payload = makePayload();
      payload.processors = [
        {
          type: "opencrvs",
          config: { endpoint: "https://primary.example/api/submit" },
        },
        {
          type: "opencrvs",
          config: { endpoint: "https://secondary.example/api/submit" },
        },
      ];
      payload.processorIndex = 1;

      await processor.process(payload);

      const headers = reqConfig().headers;
      expect(headers["X-Idempotency-Key"]).toBe("sub-002:1");
    });
  });
});
