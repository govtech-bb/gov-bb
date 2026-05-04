import { Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  SESv2Client,
  SendEmailCommand,
  type SendEmailCommandInput,
} from "@aws-sdk/client-sesv2";
import { EmailProcessor } from "./email.processor";
import type { SubmissionCreatedEvent } from "../submissions.types";

jest.mock("@aws-sdk/client-sesv2");

const mockSend = jest.fn().mockResolvedValue({ MessageId: "ses-msg-001" });
(SESv2Client as jest.Mock).mockImplementation(() => ({ send: mockSend }));

function makeConfig(overrides: Record<string, unknown> = {}): ConfigService {
  const defaults: Record<string, unknown> = {
    "email.region": "ap-southeast-1",
    "email.from": "noreply@test.gov",
    "email.configurationSet": undefined,
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
    idempotencyKey: "idem-email-1",
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

/** Extracts the SendEmailCommand input from the first constructor call.
 *
 * jest.mock() replaces SendEmailCommand with a mock constructor that records
 * every `new SendEmailCommand(input)` call. Reading mock.calls[0][0] gives us
 * the raw input object without relying on the real .input property (which is
 * absent from the auto-mocked class).
 */
function getSentInput() {
  // jest.mock() replaces SendEmailCommand with a mock constructor that records
  // every `new SendEmailCommand(input)` call. mock.calls[0][0] is the raw
  // input object — the real .input property is absent from the auto-mocked class.
  const MockedCmd = SendEmailCommand as unknown as jest.Mock;
  return MockedCmd.mock.calls[0][0] as SendEmailCommandInput;
}

describe("EmailProcessor", () => {
  let processor: EmailProcessor;

  beforeEach(() => {
    jest.clearAllMocks();
    processor = new EmailProcessor(makeConfig());
  });

  describe("process", () => {
    it("sends to the address resolved from recipientField", async () => {
      await processor.process(makePayload());

      expect(getSentInput().Destination?.ToAddresses).toEqual([
        "jane@example.com",
      ]);
    });

    it("sends from the configured SES sender identity", async () => {
      await processor.process(makePayload());

      expect(getSentInput().FromEmailAddress).toBe("noreply@test.gov");
    });

    it("uses the subject from processor config when provided", async () => {
      await processor.process(
        makePayload({ subject: "Passport renewal received" }),
      );

      expect(getSentInput().Content?.Simple?.Subject?.Data).toBe(
        "Passport renewal received",
      );
    });

    it("falls back to a default subject when none is configured", async () => {
      await processor.process(makePayload());

      const subject = getSentInput().Content?.Simple?.Subject?.Data ?? "";
      expect(subject.length).toBeGreaterThan(0);
    });

    it("tags the send with submissionId for SES event stream traceability", async () => {
      await processor.process(makePayload());

      expect(getSentInput().EmailTags).toEqual(
        expect.arrayContaining([{ Name: "submissionId", Value: "sub-001" }]),
      );
    });

    it("includes ConfigurationSetName when configured", async () => {
      processor = new EmailProcessor(
        makeConfig({ "email.configurationSet": "modular-forms-prod" }),
      );
      await processor.process(makePayload());

      expect(getSentInput().ConfigurationSetName).toBe("modular-forms-prod");
    });

    it("omits ConfigurationSetName when not configured", async () => {
      await processor.process(makePayload());

      expect(getSentInput().ConfigurationSetName).toBeUndefined();
    });

    it("skips and warns when recipientField is missing from processor config", async () => {
      const warn = jest.spyOn(Logger.prototype, "warn").mockImplementation();
      const payload = makePayload();
      payload.processors = [{ type: "email", config: {} }];

      await processor.process(payload);

      expect(mockSend).not.toHaveBeenCalled();
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining("No recipientField"),
      );
      warn.mockRestore();
    });

    it("skips and warns when the field value cannot be resolved from submission values", async () => {
      const warn = jest.spyOn(Logger.prototype, "warn").mockImplementation();
      const payload = makePayload({}, { personal: {} }); // email field missing

      await processor.process(payload);

      expect(mockSend).not.toHaveBeenCalled();
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining("Could not resolve recipient"),
      );
      warn.mockRestore();
    });
  });
});
