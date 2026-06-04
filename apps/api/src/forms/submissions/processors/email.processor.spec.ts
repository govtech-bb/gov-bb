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
import type { FilesService } from "../../../files/files.service";
import type { FormConfigService } from "../../form-config/form-config.service";
import type { ContactDetails, ServiceContract } from "@govtech-bb/form-types";
import type { SubmissionCreatedEvent } from "../submissions.types";

jest.mock("@aws-sdk/client-sesv2");

const mockSend = jest.fn().mockResolvedValue({ MessageId: "ses-msg-001" });
(SESv2Client as jest.Mock).mockImplementation(() => ({ send: mockSend }));

function makeConfig(overrides: Record<string, unknown> = {}): ConfigService {
  const defaults: Record<string, unknown> = {
    "email.region": "ap-southeast-1",
    "email.from": "noreply@test.gov",
    "email.configurationSet": undefined,
    "email.defaultRecipient": "testing@govtech.bb",
    ...overrides,
  };
  return { get: (key: string) => defaults[key] } as unknown as ConfigService;
}

function makePayload(
  processorConfig: Record<string, string> = {},
  valueOverrides: Record<string, Record<string, unknown>> = {},
  payloadOverrides: Partial<SubmissionCreatedEvent> = {},
): SubmissionCreatedEvent {
  return {
    submissionId: "sub-001",
    referenceCode: "PPT-20260604-130732-9JZRZC",
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
    ...payloadOverrides,
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

/** Minimal contract — no file fields unless `steps` provided. */
function makeContract(steps: unknown[] = []): ServiceContract {
  return {
    formId: "passport-renewal",
    title: "Test Form",
    version: "1.0.0",
    steps,
  } as unknown as ServiceContract;
}

function makeBodyBuilder(
  ctx: EmailTemplateContext = STUB_CTX,
  contactDetails: ContactDetails | undefined = undefined,
  contract: ServiceContract = makeContract(),
): jest.Mocked<EmailBodyBuilder> {
  return {
    build: jest.fn().mockResolvedValue(ctx),
    resolveContactDetails: jest.fn().mockResolvedValue(contactDetails),
    resolveContract: jest.fn().mockResolvedValue(contract),
  } as unknown as jest.Mocked<EmailBodyBuilder>;
}

function makeFilesService(): jest.Mocked<FilesService> {
  return {
    getObjectBytes: jest.fn().mockResolvedValue(Buffer.from("file-bytes")),
    getSignedReadUrl: jest
      .fn()
      .mockResolvedValue("https://s3.test/signed/download-url"),
  } as unknown as jest.Mocked<FilesService>;
}

/** FormConfigService stub. `mdaEmail` is what resolveMdaEmail returns — null
 * models "no row / no contact" (sandbox, or a freshly-migrated recipe). */
function makeFormConfigService(
  mdaEmail: string | null = null,
): jest.Mocked<FormConfigService> {
  return {
    resolveMdaEmail: jest.fn().mockResolvedValue(mdaEmail),
  } as unknown as jest.Mocked<FormConfigService>;
}

describe("EmailProcessor", () => {
  let processor: EmailProcessor;

  beforeEach(() => {
    jest.clearAllMocks();
    processor = new EmailProcessor(
      makeConfig(),
      makeTemplateService(),
      makeBodyBuilder(),
      makeFilesService(),
      makeFormConfigService(),
    );
  });

  describe("process", () => {
    it("sends to the address resolved from recipientField", async () => {
      await processor.process(makePayload());

      expect(getSentInput().Destination?.ToAddresses).toEqual([
        "jane@example.com",
      ]);
    });

    it("sends to a literal email when recipientField is an address, not a field path", async () => {
      // A recipe hardcodes a fixed internal recipient by putting the address
      // straight in recipientField (e.g. "testing@govtech.bb") rather than a
      // "stepId.fieldId" path. It must be used verbatim, not path-resolved.
      await processor.process(
        makePayload({ recipientField: "testing@govtech.bb" }),
      );

      expect(getSentInput().Destination?.ToAddresses).toEqual([
        "testing@govtech.bb",
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
        makeFilesService(),
        makeFormConfigService(),
      );
      await processor.process(makePayload());

      expect(getSentInput().ConfigurationSetName).toBe("modular-forms-prod");
    });

    it("omits ConfigurationSetName when not configured", async () => {
      await processor.process(makePayload());

      expect(getSentInput().ConfigurationSetName).toBeUndefined();
    });

    it("throws when recipientField is missing from processor config", async () => {
      const payload = makePayload();
      payload.processors = [{ type: "email", config: {} as never }];

      await expect(processor.process(payload)).rejects.toThrow(
        /No recipientField/,
      );
      expect(mockSend).not.toHaveBeenCalled();
    });

    it("throws when the field value cannot be resolved from submission values", async () => {
      const payload = makePayload({}, { personal: {} }); // email field missing

      await expect(processor.process(payload)).rejects.toThrow(
        /Could not resolve recipient/,
      );
      expect(mockSend).not.toHaveBeenCalled();
    });

    it("throws when recipientField resolves to a repeatable (array) step — unsupported", async () => {
      // Branch: `stepValues && !Array.isArray(stepValues)` — the Array.isArray arm
      const payload = makePayload({ recipientField: "jobs.email" }, {
        jobs: [{ email: "jane@example.com" }],
      } as unknown as Record<string, Record<string, unknown>>);

      await expect(processor.process(payload)).rejects.toThrow(
        /Could not resolve recipient/,
      );
      expect(mockSend).not.toHaveBeenCalled();
    });

    it("throws when the SES send fails so the failure is not silently swallowed", async () => {
      mockSend.mockRejectedValueOnce(new Error("SES throttled"));

      await expect(processor.process(makePayload())).rejects.toThrow(
        /Failed to send email/,
      );
    });

    it("falls back to noreply@gov.bb when email.from is not configured", async () => {
      // Branch: `config.get<string>("email.from") ?? "noreply@gov.bb"`
      processor = new EmailProcessor(
        makeConfig({ "email.from": undefined }),
        makeTemplateService(),
        makeBodyBuilder(),
        makeFilesService(),
        makeFormConfigService(),
      );

      await processor.process(makePayload());

      expect(getSentInput().FromEmailAddress).toBe("noreply@gov.bb");
    });
  });

  describe("contactDetails.* recipient resolution", () => {
    const MDA_CONTACT: ContactDetails = {
      title: "Passport Office",
      telephoneNumber: "+1-246-555-0100",
      email: "mda@gov.bb",
    };

    it("resolves the recipient from the contract's contactDetails, not submission values", async () => {
      const bodyBuilder = makeBodyBuilder(STUB_CTX, MDA_CONTACT);
      processor = new EmailProcessor(
        makeConfig(),
        makeTemplateService(),
        bodyBuilder,
        makeFilesService(),
        makeFormConfigService(),
      );
      const payload = makePayload({ recipientField: "contactDetails.email" });

      await processor.process(payload);

      expect(bodyBuilder.resolveContactDetails).toHaveBeenCalledWith(
        expect.objectContaining({ submissionId: "sub-001" }),
      );
      expect(getSentInput().Destination?.ToAddresses).toEqual(["mda@gov.bb"]);
    });

    it("is a no-op when no entry exists at processorIndex (defensive guard)", async () => {
      // Per-entry dispatch never invokes us without a matching entry, but a
      // corrupted/out-of-range index should be a no-op, not a throw.
      const payload = makePayload();
      payload.processors = [];

      const result = await processor.process(payload);

      expect(result).toEqual({ kind: "completed" });
      expect(mockSend).not.toHaveBeenCalled();
    });

    it("acts only on the entry at processorIndex, ignoring siblings", async () => {
      // Per-entry dispatch: each message addresses one entry by index. Index 1
      // targets the MDA contactDetails recipient only — the applicant entry is
      // a separate message.
      const bodyBuilder = makeBodyBuilder(STUB_CTX, MDA_CONTACT);
      processor = new EmailProcessor(
        makeConfig(),
        makeTemplateService(),
        bodyBuilder,
        makeFilesService(),
        makeFormConfigService(),
      );
      const payload = makePayload();
      payload.processors = [
        { type: "email", config: { recipientField: "personal.email" } },
        { type: "email", config: { recipientField: "contactDetails.email" } },
      ];
      payload.processorIndex = 1;

      await processor.process(payload);

      expect(mockSend).toHaveBeenCalledTimes(1);
      expect(getSentInput().Destination?.ToAddresses).toEqual(["mda@gov.bb"]);
    });

    it("dispatches an applicant and an MDA email as two independent indexed entries", async () => {
      const bodyBuilder = makeBodyBuilder(STUB_CTX, MDA_CONTACT);
      processor = new EmailProcessor(
        makeConfig(),
        makeTemplateService(),
        bodyBuilder,
        makeFilesService(),
        makeFormConfigService(),
      );
      const payload = makePayload();
      payload.processors = [
        { type: "email", config: { recipientField: "personal.email" } },
        { type: "email", config: { recipientField: "contactDetails.email" } },
      ];

      payload.processorIndex = 0;
      await processor.process(payload);
      payload.processorIndex = 1;
      await processor.process(payload);

      const recipients = (SendEmailCommand as unknown as jest.Mock).mock.calls
        .map((c) => (c[0] as SendEmailCommandInput).Destination?.ToAddresses)
        .flat();
      expect(recipients).toEqual(["jane@example.com", "mda@gov.bb"]);
    });

    it("throws in isolation for the entry whose contactDetails recipient cannot be resolved", async () => {
      const bodyBuilder = makeBodyBuilder(STUB_CTX, undefined); // no contactDetails
      processor = new EmailProcessor(
        makeConfig(),
        makeTemplateService(),
        bodyBuilder,
        makeFilesService(),
        makeFormConfigService(),
      );
      const payload = makePayload();
      payload.processors = [
        { type: "email", config: { recipientField: "personal.email" } },
        { type: "email", config: { recipientField: "contactDetails.email" } },
      ];

      // The applicant entry (index 0) sends fine on its own message.
      payload.processorIndex = 0;
      await expect(processor.process(payload)).resolves.toBeDefined();
      expect(mockSend).toHaveBeenCalledTimes(1);

      // The MDA entry (index 1) fails loudly in isolation and sends nothing —
      // a retry re-runs only this entry, never re-sending the applicant email.
      payload.processorIndex = 1;
      await expect(processor.process(payload)).rejects.toThrow(
        /Could not resolve recipient/,
      );
      expect(mockSend).toHaveBeenCalledTimes(1);
    });

    it("throws when the requested contactDetails key is absent", async () => {
      const bodyBuilder = makeBodyBuilder(STUB_CTX, MDA_CONTACT);
      processor = new EmailProcessor(
        makeConfig(),
        makeTemplateService(),
        bodyBuilder,
        makeFilesService(),
        makeFormConfigService(),
      );
      // contactDetails has no `fax` key.
      const payload = makePayload({ recipientField: "contactDetails.fax" });

      await expect(processor.process(payload)).rejects.toThrow(
        /Could not resolve recipient/,
      );
      expect(mockSend).not.toHaveBeenCalled();
    });

    it("throws when the requested contactDetails key is a non-string (e.g. address object)", async () => {
      const bodyBuilder = makeBodyBuilder(STUB_CTX, {
        ...MDA_CONTACT,
        address: { line1: "1 Bay St", city: "Bridgetown" },
      });
      processor = new EmailProcessor(
        makeConfig(),
        makeTemplateService(),
        bodyBuilder,
        makeFilesService(),
        makeFormConfigService(),
      );
      const payload = makePayload({ recipientField: "contactDetails.address" });

      await expect(processor.process(payload)).rejects.toThrow(
        /Could not resolve recipient/,
      );
      expect(mockSend).not.toHaveBeenCalled();
    });
  });
});

describe("EmailProcessor — config.* recipient resolution", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("resolves the recipient from form_config (config.mdaEmail), not submission values", async () => {
    const formConfig = makeFormConfigService("mda-notify@gov.bb");
    const processor = new EmailProcessor(
      makeConfig(),
      makeTemplateService(),
      makeBodyBuilder(),
      makeFilesService(),
      formConfig,
    );
    const payload = makePayload({ recipientField: "config.mdaEmail" });

    await processor.process(payload);

    expect(formConfig.resolveMdaEmail).toHaveBeenCalledWith("passport-renewal");
    expect(getSentInput().Destination?.ToAddresses).toEqual([
      "mda-notify@gov.bb",
    ]);
  });

  it("falls back to the default test inbox when no form_config row resolves (sandbox)", async () => {
    const processor = new EmailProcessor(
      makeConfig(),
      makeTemplateService(),
      makeBodyBuilder(),
      makeFilesService(),
      makeFormConfigService(null),
    );
    const payload = makePayload({ recipientField: "config.mdaEmail" });

    await processor.process(payload);

    expect(getSentInput().Destination?.ToAddresses).toEqual([
      "testing@govtech.bb",
    ]);
  });

  it("falls back to a configured override default recipient", async () => {
    const processor = new EmailProcessor(
      makeConfig({ "email.defaultRecipient": "ops@gov.bb" }),
      makeTemplateService(),
      makeBodyBuilder(),
      makeFilesService(),
      makeFormConfigService(null),
    );
    const payload = makePayload({ recipientField: "config.mdaEmail" });

    await processor.process(payload);

    expect(getSentInput().Destination?.ToAddresses).toEqual(["ops@gov.bb"]);
  });

  it("degrades to the default on a resolved miss — the send still happens, no throw", async () => {
    const processor = new EmailProcessor(
      makeConfig(),
      makeTemplateService(),
      makeBodyBuilder(),
      makeFilesService(),
      makeFormConfigService(null),
    );
    const payload = makePayload({ recipientField: "config.mdaEmail" });

    await expect(processor.process(payload)).resolves.toEqual({
      kind: "completed",
    });
    expect(mockSend).toHaveBeenCalledTimes(1);
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
      makeFilesService(),
      makeFormConfigService(),
    );
  }

  it("renders the submission-confirmation template for every form", async () => {
    const templateSvc = makeTemplateService("<h1>Confirmation</h1>");
    const processor = new EmailProcessor(
      makeConfig(),
      templateSvc,
      makeBodyBuilder(),
      makeFilesService(),
      makeFormConfigService(),
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
      makeFilesService(),
      makeFormConfigService(),
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
      makeFilesService(),
      makeFormConfigService(),
    );

    await processor.process(makePayload());

    const html =
      (getSentInput().Content?.Simple?.Body?.Html?.Data as string) ?? "";
    // Fallback HTML shows referenceCode, not the raw UUID
    expect(html).toContain("PPT-20260604-130732-9JZRZC");
    expect(html).not.toContain("Confirmation");
  });

  it("falls back to generic HTML when template render returns null", async () => {
    const processor = makeProcessor(null);

    await processor.process(makePayload());

    const html =
      (getSentInput().Content?.Simple?.Body?.Html?.Data as string) ?? "";
    // Fallback HTML shows referenceCode, not the raw UUID
    expect(html).toContain("PPT-20260604-130732-9JZRZC");
  });

  it("falls back to generic HTML when template render throws", async () => {
    const bodyBuilder = makeBodyBuilder();
    bodyBuilder.build.mockRejectedValue(new Error("DB unavailable"));
    const processor = new EmailProcessor(
      makeConfig(),
      makeTemplateService(),
      bodyBuilder,
      makeFilesService(),
      makeFormConfigService(),
    );

    await processor.process(makePayload());

    const html =
      (getSentInput().Content?.Simple?.Body?.Html?.Data as string) ?? "";
    // Fallback HTML shows referenceCode, not the raw UUID
    expect(html).toContain("PPT-20260604-130732-9JZRZC");
  });
});

describe("EmailProcessor — reference code in plain-text and fallback HTML bodies", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("uses referenceCode in the plain-text body when the builder throws (fallback path)", async () => {
    // When EmailBodyBuilder.build() throws, resolveHtmlBody falls back to
    // buildHtmlBody (inline) and the text body is always built from buildTextBody.
    // Both must show the referenceCode, not the raw UUID.
    const bodyBuilder = makeBodyBuilder();
    (bodyBuilder.build as jest.Mock).mockRejectedValue(new Error("DB down"));
    const processor = new EmailProcessor(
      makeConfig(),
      makeTemplateService(),
      bodyBuilder,
      makeFilesService(),
      makeFormConfigService(),
    );

    await processor.process(makePayload());

    const input = getSentInput();
    const text = input.Content?.Simple?.Body?.Text?.Data as string;
    const html = input.Content?.Simple?.Body?.Html?.Data as string;

    expect(text).toContain("PPT-20260604-130732-9JZRZC");
    expect(text).not.toContain("Reference: sub-001");
    expect(html).toContain("PPT-20260604-130732-9JZRZC");
    // Ensure no stray JS comment leaks into the HTML body as literal text
    expect(html).not.toContain("referenceCode is required on the event");
    expect(html).not.toContain("// ");
  });

  it("renders referenceCode in the text body when consumer has coalesced it to submissionId (legacy-event path)", async () => {
    // The SQS consumer sets referenceCode = submissionId for pre-referenceCode
    // payloads; verify that coalesced value is rendered correctly in the email.
    const bodyBuilder = makeBodyBuilder();
    (bodyBuilder.build as jest.Mock).mockRejectedValue(new Error("DB down"));
    const processor = new EmailProcessor(
      makeConfig(),
      makeTemplateService(),
      bodyBuilder,
      makeFilesService(),
      makeFormConfigService(),
    );

    // referenceCode === submissionId — this is what the consumer sets for legacy events.
    const payload = makePayload({}, {}, { referenceCode: "sub-001" });

    await processor.process(payload);

    const text = getSentInput().Content?.Simple?.Body?.Text?.Data as string;
    expect(text).toContain("Reference: sub-001");
  });
});

describe("EmailProcessor — uploaded file attachments (issue #658)", () => {
  const FILE_CONTRACT = makeContract([
    {
      stepId: "documents",
      title: "Documents",
      elements: [
        {
          fieldId: "policeCertificate",
          label: "Police Certificate",
          htmlType: "file",
          multiple: true,
        },
      ],
    },
  ]);

  const SMALL_FILE = {
    key: "uploads/passport-renewal/2026/06/uuid-cert.pdf",
    name: "cert.pdf",
    size: 1024,
    type: "application/pdf",
  };
  const HUGE_FILE = {
    key: "uploads/passport-renewal/2026/06/uuid-big.pdf",
    name: "big.pdf",
    size: 9 * 1024 * 1024, // over the 7 MB attachment budget
    type: "application/pdf",
  };

  function makeFilePayload(
    recipientField: string,
    files: unknown[],
  ): SubmissionCreatedEvent {
    const payload = makePayload({ recipientField });
    payload.values = {
      ...payload.values,
      documents: { policeCertificate: files },
    };
    return payload;
  }

  function getRawMessage(): string {
    const data = getSentInput().Content?.Raw?.Data;
    expect(data).toBeDefined();
    return Buffer.from(data as Uint8Array).toString("utf8");
  }

  let filesService: jest.Mocked<FilesService>;
  let templateService: jest.Mocked<EmailTemplateService>;
  let processor: EmailProcessor;

  beforeEach(() => {
    jest.clearAllMocks();
    filesService = makeFilesService();
    templateService = makeTemplateService();
    processor = new EmailProcessor(
      makeConfig(),
      templateService,
      makeBodyBuilder(STUB_CTX, undefined, FILE_CONTRACT),
      filesService,
      makeFormConfigService(),
    );
  });

  it("attaches uploaded files for a literal (MDA) recipient via Content.Raw", async () => {
    await processor.process(
      makeFilePayload("mda-registration@govtech.bb", [SMALL_FILE]),
    );

    expect(filesService.getObjectBytes).toHaveBeenCalledWith(SMALL_FILE.key);
    const input = getSentInput();
    expect(input.Content?.Simple).toBeUndefined();
    expect(input.Destination?.ToAddresses).toEqual([
      "mda-registration@govtech.bb",
    ]);

    const raw = getRawMessage();
    expect(raw).toContain("cert.pdf");
    // base64 of "file-bytes" — the attachment content actually travels
    expect(raw).toContain("ZmlsZS1ieXRlcw==");
  });

  it("attaches uploaded files for a contactDetails.* (MDA) recipient", async () => {
    processor = new EmailProcessor(
      makeConfig(),
      templateService,
      makeBodyBuilder(
        STUB_CTX,
        {
          title: "Passport Office",
          telephoneNumber: "+1-246-555-0100",
          email: "mda@gov.bb",
        },
        FILE_CONTRACT,
      ),
      filesService,
      makeFormConfigService(),
    );

    await processor.process(
      makeFilePayload("contactDetails.email", [SMALL_FILE]),
    );

    expect(filesService.getObjectBytes).toHaveBeenCalledWith(SMALL_FILE.key);
    expect(getSentInput().Content?.Raw?.Data).toBeDefined();
    expect(getSentInput().Destination?.ToAddresses).toEqual(["mda@gov.bb"]);
  });

  it("attaches uploaded files for a config.* (MDA) recipient", async () => {
    processor = new EmailProcessor(
      makeConfig(),
      templateService,
      makeBodyBuilder(STUB_CTX, undefined, FILE_CONTRACT),
      filesService,
      makeFormConfigService("mda-notify@gov.bb"),
    );

    await processor.process(makeFilePayload("config.mdaEmail", [SMALL_FILE]));

    expect(filesService.getObjectBytes).toHaveBeenCalledWith(SMALL_FILE.key);
    expect(getSentInput().Content?.Raw?.Data).toBeDefined();
    expect(getSentInput().Destination?.ToAddresses).toEqual([
      "mda-notify@gov.bb",
    ]);
  });

  it("does NOT attach files on the citizen confirmation (field-path recipient)", async () => {
    await processor.process(makeFilePayload("personal.email", [SMALL_FILE]));

    expect(filesService.getObjectBytes).not.toHaveBeenCalled();
    expect(filesService.getSignedReadUrl).not.toHaveBeenCalled();
    expect(getSentInput().Content?.Simple).toBeDefined();
    expect(getSentInput().Content?.Raw).toBeUndefined();
  });

  it("keeps the Simple path when the form has no file fields", async () => {
    processor = new EmailProcessor(
      makeConfig(),
      templateService,
      makeBodyBuilder(STUB_CTX, undefined, makeContract()),
      filesService,
      makeFormConfigService(),
    );

    await processor.process(makePayload({ recipientField: "mda@govtech.bb" }));

    expect(filesService.getObjectBytes).not.toHaveBeenCalled();
    expect(getSentInput().Content?.Simple).toBeDefined();
  });

  it("falls back to a signed download link when a file exceeds the attachment budget", async () => {
    await processor.process(makeFilePayload("mda@govtech.bb", [HUGE_FILE]));

    expect(filesService.getObjectBytes).not.toHaveBeenCalled();
    // 72h TTL — a bearer URL in a forwardable email, not the 7-day default
    expect(filesService.getSignedReadUrl).toHaveBeenCalledWith(
      HUGE_FILE.key,
      72 * 60 * 60,
    );

    // No attachments → Simple path, with the link in both bodies
    const input = getSentInput();
    expect(input.Content?.Simple).toBeDefined();
    expect(input.Content?.Simple?.Body?.Text?.Data).toContain(
      "https://s3.test/signed/download-url",
    );
    expect(templateService.render).toHaveBeenCalledWith(
      "submission-confirmation",
      expect.objectContaining({
        fileLinks: [
          { name: "big.pdf", url: "https://s3.test/signed/download-url" },
        ],
      }),
    );
  });

  it("attaches what fits and links the rest when files exceed the budget together", async () => {
    const fourMb = { ...SMALL_FILE, size: 4 * 1024 * 1024 };
    const anotherFourMb = {
      ...HUGE_FILE,
      size: 4 * 1024 * 1024, // fits alone, not after the first 4 MB
    };
    // Real object size matches the claim — budget counts downloaded bytes
    filesService.getObjectBytes.mockResolvedValue(
      Buffer.alloc(4 * 1024 * 1024),
    );

    await processor.process(
      makeFilePayload("mda@govtech.bb", [fourMb, anotherFourMb]),
    );

    expect(filesService.getObjectBytes).toHaveBeenCalledTimes(1);
    expect(filesService.getObjectBytes).toHaveBeenCalledWith(fourMb.key);
    expect(filesService.getSignedReadUrl).toHaveBeenCalledTimes(1);
    expect(filesService.getSignedReadUrl).toHaveBeenCalledWith(
      anotherFourMb.key,
      72 * 60 * 60,
    );
    expect(getSentInput().Content?.Raw?.Data).toBeDefined();
  });

  it("links instead of attaching when a file's size is unknown (0)", async () => {
    await processor.process(
      makeFilePayload("mda@govtech.bb", [{ ...SMALL_FILE, size: 0 }]),
    );

    expect(filesService.getObjectBytes).not.toHaveBeenCalled();
    expect(filesService.getSignedReadUrl).toHaveBeenCalledWith(
      SMALL_FILE.key,
      72 * 60 * 60,
    );
  });

  it("enforces the budget on actual downloaded bytes, not the client-reported size", async () => {
    // Client claims 1 KB but the real object is 8 MB — over budget.
    filesService.getObjectBytes.mockResolvedValue(
      Buffer.alloc(8 * 1024 * 1024),
    );

    await processor.process(makeFilePayload("mda@govtech.bb", [SMALL_FILE]));

    // Downloaded once to learn the real size, then linked instead of attached
    expect(filesService.getObjectBytes).toHaveBeenCalledTimes(1);
    expect(filesService.getSignedReadUrl).toHaveBeenCalledWith(
      SMALL_FILE.key,
      72 * 60 * 60,
    );
    expect(getSentInput().Content?.Simple).toBeDefined();
    expect(getSentInput().Content?.Raw).toBeUndefined();
  });

  it("skips files whose key is outside the submission's form prefix (no attach, no link)", async () => {
    const foreign = {
      ...SMALL_FILE,
      key: "uploads/other-form/2026/06/uuid-stolen.pdf",
    };

    await processor.process(makeFilePayload("mda@govtech.bb", [foreign]));

    expect(filesService.getObjectBytes).not.toHaveBeenCalled();
    expect(filesService.getSignedReadUrl).not.toHaveBeenCalled();
    expect(getSentInput().Content?.Simple).toBeDefined();
  });

  it("fails the entry loudly when the S3 download fails (SQS retry re-attempts)", async () => {
    filesService.getObjectBytes.mockRejectedValue(new Error("S3 throttled"));

    await expect(
      processor.process(makeFilePayload("mda@govtech.bb", [SMALL_FILE])),
    ).rejects.toThrow(/Failed to send email/);
    expect(mockSend).not.toHaveBeenCalled();
  });
});
