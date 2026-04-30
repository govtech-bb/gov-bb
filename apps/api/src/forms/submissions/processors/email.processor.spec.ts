import { Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import * as nodemailer from "nodemailer";
import { EmailProcessor } from "./email.processor";
import type { SubmissionCreatedEvent } from "../submissions.types";

jest.mock("nodemailer");

const mockSendMail = jest.fn().mockResolvedValue({ messageId: "test-id" });
const mockCreateTransport = nodemailer.createTransport as jest.Mock;

function makeConfig(overrides: Record<string, unknown> = {}): ConfigService {
  const defaults: Record<string, unknown> = {
    "email.host": "smtp.test.local",
    "email.port": 587,
    "email.secure": false,
    "email.user": "user",
    "email.pass": "pass",
    "email.from": "noreply@test.gov",
    ...overrides,
  };
  return { get: (key: string) => defaults[key] } as unknown as ConfigService;
}

function makePayload(
  processorConfig: Record<string, string> = {},
  valueOverrides: Record<string, Record<string, unknown>> = {},
): SubmissionCreatedEvent {
  return {
    submissionId: "sub-001",
    formId: "passport-renewal",
    formVersion: "1.0.0",
    processors: [
      {
        type: "email",
        config: { recipientField: "personal.email", ...processorConfig },
      },
    ],
    values: { personal: { email: "jane@example.com" }, ...valueOverrides },
    meta: {
      schemaVersion: 1,
      pinnedFormVersion: "1.0.0",
      draftId: "draft-001",
      activeStepIds: ["personal"],
      hiddenStepIds: [],
      activeFieldIds: { personal: ["email"] },
      hiddenFieldIds: {},
      visitedPages: [0],
      submittedAt: "2026-04-29T10:00:00.000Z",
    },
  };
}

describe("EmailProcessor", () => {
  let processor: EmailProcessor;

  beforeEach(() => {
    jest.clearAllMocks();
    mockCreateTransport.mockReturnValue({ sendMail: mockSendMail });
    processor = new EmailProcessor(makeConfig());
  });

  describe("process", () => {
    it("sends an email to the address resolved from recipientField", async () => {
      await processor.process(makePayload());

      expect(mockSendMail).toHaveBeenCalledWith(
        expect.objectContaining({ to: "jane@example.com" }),
      );
    });

    it("uses the configured from address", async () => {
      await processor.process(makePayload());

      expect(mockSendMail).toHaveBeenCalledWith(
        expect.objectContaining({ from: "noreply@test.gov" }),
      );
    });

    it("uses the subject from processor config when provided", async () => {
      await processor.process(makePayload({ subject: "Custom subject" }));

      expect(mockSendMail).toHaveBeenCalledWith(
        expect.objectContaining({ subject: "Custom subject" }),
      );
    });

    it("falls back to a default subject when none is configured", async () => {
      await processor.process(makePayload());

      expect(mockSendMail).toHaveBeenCalledWith(
        expect.objectContaining({ subject: expect.any(String) }),
      );
      const call = mockSendMail.mock.calls[0][0];
      expect(call.subject.length).toBeGreaterThan(0);
    });

    it("sets a deterministic Message-ID for retry safety", async () => {
      await processor.process(makePayload());

      const call = mockSendMail.mock.calls[0][0];
      expect(call.headers["Message-ID"]).toContain("sub-001");
    });

    it("skips and warns when recipientField is missing from processor config", async () => {
      const warn = jest.spyOn(Logger.prototype, "warn").mockImplementation();
      const payload = makePayload();
      payload.processors = [{ type: "email", config: {} }];

      await processor.process(payload);

      expect(mockSendMail).not.toHaveBeenCalled();
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining("No recipientField"),
      );
      warn.mockRestore();
    });

    it("skips and warns when the field value cannot be resolved from submission values", async () => {
      const warn = jest.spyOn(Logger.prototype, "warn").mockImplementation();
      const payload = makePayload({}, { personal: {} }); // email field missing

      await processor.process(payload);

      expect(mockSendMail).not.toHaveBeenCalled();
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining("Could not resolve recipient"),
      );
      warn.mockRestore();
    });
  });
});
