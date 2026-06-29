import type { Mock } from "vitest";
import { ConfigService } from "@nestjs/config";
import {
  SendEmailCommand,
  type SendEmailCommandInput,
} from "@aws-sdk/client-sesv2";
import { SesMailer } from "./ses-mailer";

const { mockSend } = vi.hoisted(() => ({
  mockSend: vi.fn().mockResolvedValue({ MessageId: "ses-msg-001" }),
}));
vi.mock("@aws-sdk/client-sesv2", () => ({
  SESv2Client: vi.fn(function (this: { send: typeof mockSend }) {
    this.send = mockSend;
  }),
  SendEmailCommand: vi.fn(function (this: { input: unknown }, input: unknown) {
    this.input = input;
  }),
}));

function makeConfig(overrides: Record<string, unknown> = {}): ConfigService {
  const defaults: Record<string, unknown> = {
    "email.region": "ap-southeast-1",
    "email.from": "noreply@test.gov",
    "email.configurationSet": undefined,
    "email.assetBaseUrl": undefined,
    ...overrides,
  };
  return { get: (key: string) => defaults[key] } as unknown as ConfigService;
}

function getSentInput() {
  const MockedCmd = SendEmailCommand as unknown as Mock;
  return MockedCmd.mock.calls[0][0] as SendEmailCommandInput;
}

describe("SesMailer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("config resolution", () => {
    it("exposes the configured sender identity", () => {
      expect(new SesMailer(makeConfig()).from).toBe("noreply@test.gov");
    });

    it("falls back to noreply@gov.bb when email.from is not configured", () => {
      expect(new SesMailer(makeConfig({ "email.from": undefined })).from).toBe(
        "noreply@gov.bb",
      );
    });

    it("exposes the configuration set when configured", () => {
      const mailer = new SesMailer(
        makeConfig({ "email.configurationSet": "modular-forms-prod" }),
      );
      expect(mailer.configurationSet).toBe("modular-forms-prod");
    });

    it("derives the coat-of-arms URL from the asset base URL", () => {
      const mailer = new SesMailer(
        makeConfig({ "email.assetBaseUrl": "https://forms.gov.bb/" }),
      );
      expect(mailer.coatOfArmsUrl).toBe(
        "https://forms.gov.bb/images/coat-of-arms.png",
      );
    });

    it("leaves the coat-of-arms URL undefined when no asset base URL is set", () => {
      expect(new SesMailer(makeConfig()).coatOfArmsUrl).toBeUndefined();
    });
  });

  describe("sendSimple", () => {
    it("sends a Content.Simple email to the recipient with the html body and sender", async () => {
      const mailer = new SesMailer(makeConfig());

      await mailer.sendSimple({
        to: "citizen@example.com",
        subject: "Payment required",
        html: "<h1>Pay now</h1>",
      });

      expect(mockSend).toHaveBeenCalledTimes(1);
      const input = getSentInput();
      expect(input.Destination?.ToAddresses).toEqual(["citizen@example.com"]);
      expect(input.FromEmailAddress).toBe("noreply@test.gov");
      expect(input.Content?.Simple?.Subject?.Data).toBe("Payment required");
      expect(input.Content?.Simple?.Body?.Html?.Data).toBe("<h1>Pay now</h1>");
    });

    it("includes a plain-text body when provided", async () => {
      await new SesMailer(makeConfig()).sendSimple({
        to: "citizen@example.com",
        subject: "s",
        html: "<p>h</p>",
        text: "h",
      });

      expect(getSentInput().Content?.Simple?.Body?.Text?.Data).toBe("h");
    });

    it("includes the ConfigurationSetName when configured", async () => {
      await new SesMailer(
        makeConfig({ "email.configurationSet": "cfg-set" }),
      ).sendSimple({ to: "a@b.c", subject: "s", html: "<p>h</p>" });

      expect(getSentInput().ConfigurationSetName).toBe("cfg-set");
    });

    it("omits the ConfigurationSetName when not configured", async () => {
      await new SesMailer(makeConfig()).sendSimple({
        to: "a@b.c",
        subject: "s",
        html: "<p>h</p>",
      });

      expect(getSentInput().ConfigurationSetName).toBeUndefined();
    });
  });
});
