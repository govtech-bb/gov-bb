import { InternalServerErrorException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  SESv2Client,
  SendEmailCommand,
  type SendEmailCommandInput,
} from "@aws-sdk/client-sesv2";
import { FeedbackService, type FeedbackInput } from "./feedback.service";
import type { MetricsService } from "../telemetry/metrics.service";

jest.mock("@aws-sdk/client-sesv2");

const mockSend = jest.fn();
(SESv2Client as jest.Mock).mockImplementation(() => ({ send: mockSend }));

function makeConfig(overrides: Record<string, unknown> = {}): ConfigService {
  const defaults: Record<string, unknown> = {
    "email.region": "ap-southeast-1",
    "email.from": "noreply@test.gov",
    "email.configurationSet": undefined,
    "email.feedbackRecipient": "feedback@govtech.bb",
    ...overrides,
  };
  return { get: (key: string) => defaults[key] } as unknown as ConfigService;
}

function makeMetrics(): jest.Mocked<MetricsService> {
  return {
    recordFeedbackEmailFailure: jest.fn(),
  } as unknown as jest.Mocked<MetricsService>;
}

/** Read the SendEmailCommand input recorded by the auto-mocked constructor. */
function getSentInput(): SendEmailCommandInput {
  const MockedCmd = SendEmailCommand as unknown as jest.Mock;
  return MockedCmd.mock.calls[0][0] as SendEmailCommandInput;
}

function makeService(
  config = makeConfig(),
  metrics = makeMetrics(),
  { realSleep = false }: { realSleep?: boolean } = {},
) {
  const service = new FeedbackService(config, metrics);
  if (!realSleep) {
    // Skip real backoff delay between retries by default.
    (service as unknown as { sleep: () => Promise<void> }).sleep = () =>
      Promise.resolve();
  }
  return { service, metrics };
}

const DTO: FeedbackInput = {
  visitReason: "Renew my passport",
  whatWentWrong: "The button did nothing",
  referrer: "/feedback",
};

beforeEach(() => {
  jest.clearAllMocks();
  mockSend.mockResolvedValue({ MessageId: "ses-msg-001" });
});

describe("FeedbackService", () => {
  it("emails the configured feedback recipient with the submitted fields", async () => {
    const { service, metrics } = makeService();
    await service.send(DTO);

    expect(mockSend).toHaveBeenCalledTimes(1);
    const input = getSentInput();
    expect(input.Destination?.ToAddresses).toEqual(["feedback@govtech.bb"]);
    expect(input.FromEmailAddress).toBe("noreply@test.gov");

    const text = input.Content?.Simple?.Body?.Text?.Data ?? "";
    expect(text).toContain("Renew my passport");
    expect(text).toContain("The button did nothing");
    expect(text).toContain("/feedback");
    expect(metrics.recordFeedbackEmailFailure).not.toHaveBeenCalled();
  });

  it("omits the referrer line when no referrer is supplied", async () => {
    const { service } = makeService();
    await service.send({ visitReason: "Just looking" });

    const text = getSentInput().Content?.Simple?.Body?.Text?.Data ?? "";
    expect(text).not.toContain("Submitted from:");
  });

  it("attaches the configuration set when one is configured", async () => {
    const { service } = makeService(
      makeConfig({ "email.configurationSet": "feedback-cfg" }),
    );
    await service.send(DTO);
    expect(getSentInput().ConfigurationSetName).toBe("feedback-cfg");
  });

  it("retries a transient SES error and succeeds without surfacing it", async () => {
    mockSend
      .mockRejectedValueOnce(new Error("Throttling"))
      .mockResolvedValueOnce({ MessageId: "ses-msg-002" });
    // Use the real backoff (one ~200ms delay) so the default sleep is exercised.
    const { service, metrics } = makeService(makeConfig(), makeMetrics(), {
      realSleep: true,
    });

    await expect(service.send(DTO)).resolves.toBeUndefined();
    expect(mockSend).toHaveBeenCalledTimes(2);
    expect(metrics.recordFeedbackEmailFailure).not.toHaveBeenCalled();
  });

  it("throws and records a failure metric when every attempt fails", async () => {
    mockSend.mockRejectedValue(new Error("SES down"));
    const { service, metrics } = makeService();

    await expect(service.send(DTO)).rejects.toBeInstanceOf(
      InternalServerErrorException,
    );
    expect(mockSend).toHaveBeenCalledTimes(3);
    expect(metrics.recordFeedbackEmailFailure).toHaveBeenCalledTimes(1);
  });
});
