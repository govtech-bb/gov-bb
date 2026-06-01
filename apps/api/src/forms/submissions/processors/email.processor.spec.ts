import { Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  SESv2Client,
  SendEmailCommand,
  type SendEmailCommandInput,
} from "@aws-sdk/client-sesv2";
import { EmailProcessor } from "./email.processor";
import type { EmailTemplateService } from "../../../email/email-template.service";
import type {
  EmailBodyBuilder,
  EmailTemplateContext,
} from "../../../email/email-body.builder";
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

function makeTemplateService(
  html: string | null = "<h1>Confirmation</h1>",
): jest.Mocked<EmailTemplateService> {
  return {
    has: jest.fn().mockReturnValue(html !== null),
    render: jest.fn().mockReturnValue(html),
  } as unknown as jest.Mocked<EmailTemplateService>;
}

const STUB_CTX: EmailTemplateContext = {
  formTitle: "Test Form",
  submissionId: "sub-001",
  submittedAt: "2026-04-29T10:00:00.000Z",
  processedAt: "2026-04-29T10:00:01.000Z",
  sections: [
    {
      title: "Personal",
      fields: [{ label: "Email", value: "jane@example.com" }],
    },
  ],
};

function makeBodyBuilder(
  ctx: EmailTemplateContext = STUB_CTX,
): jest.Mocked<EmailBodyBuilder> {
  return {
    build: jest.fn().mockResolvedValue(ctx),
  } as unknown as jest.Mocked<EmailBodyBuilder>;
}

describe("EmailProcessor", () => {
  let processor: EmailProcessor;

  beforeEach(() => {
    jest.clearAllMocks();
    processor = new EmailProcessor(
      makeConfig(),
      makeTemplateService(),
      makeBodyBuilder(),
    );
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

    it("uses a literal recipientField (contains @) verbatim — e.g. an MDA/department address", async () => {
      await processor.process(
        makePayload({ recipientField: "mda-registration@govtech.bb" }),
      );

      expect(getSentInput().Destination?.ToAddresses).toEqual([
        "mda-registration@govtech.bb",
      ]);
    });

    it("redirects all mail to EMAIL_OVERRIDE_RECIPIENT when set, tagging the intended recipient in the subject", async () => {
      processor = new EmailProcessor(
        makeConfig({ "email.overrideRecipient": "qa-inbox@govtech.bb" }),
        makeTemplateService(),
        makeBodyBuilder(),
      );

      await processor.process(makePayload({ subject: "Birth cert received" }));

      const input = getSentInput();
      expect(input.Destination?.ToAddresses).toEqual(["qa-inbox@govtech.bb"]);
      const subject = (input.Content?.Simple?.Subject?.Data as string) ?? "";
      expect(subject).toContain("jane@example.com"); // intended recipient preserved
      expect(subject).toContain("Birth cert received");
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
        makeTemplateService(),
        makeBodyBuilder(),
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
      payload.processors = [{ type: "email", config: {} as never }];

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

    it("skips when recipientField resolves to a repeatable (array) step — unsupported", async () => {
      // Branch: `stepValues && !Array.isArray(stepValues)` — the Array.isArray arm
      const warn = jest.spyOn(Logger.prototype, "warn").mockImplementation();
      const payload = makePayload({ recipientField: "jobs.email" }, {
        jobs: [{ email: "jane@example.com" }],
      } as unknown as Record<string, Record<string, unknown>>);

      await processor.process(payload);

      expect(mockSend).not.toHaveBeenCalled();
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining("Could not resolve recipient"),
      );
      warn.mockRestore();
    });

    it("falls back to noreply@gov.bb when email.from is not configured", async () => {
      // Branch: `config.get<string>("email.from") ?? "noreply@gov.bb"`
      processor = new EmailProcessor(
        makeConfig({ "email.from": undefined }),
        makeTemplateService(),
        makeBodyBuilder(),
      );

      await processor.process(makePayload());

      expect(getSentInput().FromEmailAddress).toBe("noreply@gov.bb");
    });
  });
});

describe("EmailProcessor — dynamic template rendering", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  function makeProcessor(
    html: string | null = "<h1>Confirmation</h1>",
  ): EmailProcessor {
    return new EmailProcessor(
      makeConfig(),
      makeTemplateService(html),
      makeBodyBuilder(),
    );
  }

  it("renders the submission-confirmation template for every form", async () => {
    const templateSvc = makeTemplateService("<h1>Confirmation</h1>");
    const processor = new EmailProcessor(
      makeConfig(),
      templateSvc,
      makeBodyBuilder(),
    );

    await processor.process(makePayload());

    expect(templateSvc.render).toHaveBeenCalledWith(
      "submission-confirmation",
      expect.objectContaining({
        formTitle: "Test Form",
        submissionId: "sub-001",
      }),
    );
    const html =
      (getSentInput().Content?.Simple?.Body?.Html?.Data as string) ?? "";
    expect(html).toContain("Confirmation");
  });

  it("delegates contract fetching and context building to EmailBodyBuilder", async () => {
    const bodyBuilder = makeBodyBuilder();
    const processor = new EmailProcessor(
      makeConfig(),
      makeTemplateService(),
      bodyBuilder,
    );

    await processor.process(makePayload());

    expect(bodyBuilder.build).toHaveBeenCalledWith(
      expect.objectContaining({
        submissionId: "sub-001",
        formId: "passport-renewal",
      }),
    );
  });

  it("falls back to generic HTML when the builder throws (e.g. DB down)", async () => {
    const bodyBuilder = makeBodyBuilder();
    (bodyBuilder.build as jest.Mock).mockRejectedValue(new Error("DB down"));
    const processor = new EmailProcessor(
      makeConfig(),
      makeTemplateService(),
      bodyBuilder,
    );

    await processor.process(makePayload());

    const html =
      (getSentInput().Content?.Simple?.Body?.Html?.Data as string) ?? "";
    expect(html).toContain("sub-001");
    expect(html).not.toContain("Confirmation");
  });

  it("falls back to generic HTML when template render returns null", async () => {
    const processor = makeProcessor(null);

    await processor.process(makePayload());

    const html =
      (getSentInput().Content?.Simple?.Body?.Html?.Data as string) ?? "";
    expect(html).toContain("sub-001");
  });

  it("falls back to generic HTML when template render throws", async () => {
    const bodyBuilder = makeBodyBuilder();
    bodyBuilder.build.mockRejectedValue(new Error("DB unavailable"));
    const processor = new EmailProcessor(
      makeConfig(),
      makeTemplateService(),
      bodyBuilder,
    );

    await processor.process(makePayload());

    const html =
      (getSentInput().Content?.Simple?.Body?.Html?.Data as string) ?? "";
    expect(html).toContain("sub-001");
  });
});
