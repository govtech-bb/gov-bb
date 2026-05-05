import { Logger } from "@nestjs/common";
import { OpencrvsProcessor } from "./opencrvs.processor";
import type { SubmissionCreatedEvent } from "../submissions.types";

const mockFetch = jest.fn();
global.fetch = mockFetch;

function makePayload(
  processorConfig: Record<string, string> = {},
): SubmissionCreatedEvent {
  return {
    submissionId: "sub-002",
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
    jest.clearAllMocks();
    mockFetch.mockResolvedValue({ ok: true });
    processor = new OpencrvsProcessor();
  });

  describe("process", () => {
    it("POSTs submission data to the configured endpoint", async () => {
      await processor.process(makePayload());

      expect(mockFetch).toHaveBeenCalledWith(
        "https://opencrvs.example.gov.bb/api/submit",
        expect.objectContaining({ method: "POST" }),
      );
    });

    it("includes submissionId, formId, formVersion, values, and submittedAt in the body", async () => {
      await processor.process(makePayload());

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body).toMatchObject({
        submissionId: "sub-002",
        formId: "birth-registration",
        formVersion: "2.0.0",
        values: { applicant: { firstName: "Jane", surname: "Doe" } },
        submittedAt: "2026-04-29T10:00:00.000Z",
      });
    });

    it("sets X-Idempotency-Key header to submissionId for retry safety", async () => {
      await processor.process(makePayload());

      const headers = mockFetch.mock.calls[0][1].headers;
      expect(headers["X-Idempotency-Key"]).toBe("sub-002");
    });

    it("includes Authorization header when token is configured", async () => {
      await processor.process(makePayload({ token: "secret-token" }));

      const headers = mockFetch.mock.calls[0][1].headers;
      expect(headers["Authorization"]).toBe("Bearer secret-token");
    });

    it("omits Authorization header when no token is configured", async () => {
      await processor.process(makePayload());

      const headers = mockFetch.mock.calls[0][1].headers;
      expect(headers["Authorization"]).toBeUndefined();
    });

    it("skips and warns when no endpoint is configured", async () => {
      const warn = jest.spyOn(Logger.prototype, "warn").mockImplementation();
      const payload = makePayload();
      payload.processors = [{ type: "opencrvs", config: {} }];

      await processor.process(payload);

      expect(mockFetch).not.toHaveBeenCalled();
      expect(warn).toHaveBeenCalledWith(expect.stringContaining("No endpoint"));
      warn.mockRestore();
    });

    it("throws when the endpoint responds with a non-OK status", async () => {
      mockFetch.mockResolvedValue({ ok: false, status: 503 });

      await expect(processor.process(makePayload())).rejects.toThrow(
        "HTTP 503",
      );
    });
  });
});
