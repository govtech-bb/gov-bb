import type { Mock, Mocked, MockedClass } from "vitest";
import { SesEventConsumerService } from "./ses-event-consumer.service";
import { SQSClient, DeleteMessageCommand } from "@aws-sdk/client-sqs";
import type { Message } from "@aws-sdk/client-sqs";
import type { NotificationLogRepository } from "../notification-log.repository";
import { NotificationDeliveryStatus } from "@/database/entities/notification-log.entity";

const MockedDeleteMessageCommand = DeleteMessageCommand as unknown as Mock;

vi.mock("@aws-sdk/client-sqs");

const MockedSQSClient = SQSClient as MockedClass<typeof SQSClient>;

const QUEUE_URL =
  "https://sqs.ca-central-1.amazonaws.com/123/modular-forms-sandbox-email-telemetry-events";

function sesMessage(body: unknown, receiptHandle = "receipt-1"): Message {
  return {
    MessageId: "sqs-msg-1",
    ReceiptHandle: receiptHandle,
    Body: typeof body === "string" ? body : JSON.stringify(body),
  };
}

function makeConfig(queueUrl = QUEUE_URL) {
  return { queueUrl, region: "ca-central-1", endpoint: undefined };
}

function deletedReceipts(): string[] {
  return MockedDeleteMessageCommand.mock.calls
    .map(([args]: { ReceiptHandle?: string }[]) => args.ReceiptHandle)
    .filter((r: string | undefined): r is string => Boolean(r));
}

describe("SesEventConsumerService", () => {
  let sendMock: Mock;
  let repo: Mocked<Pick<NotificationLogRepository, "reconcileDeliveryStatus">>;
  let service: SesEventConsumerService;

  beforeEach(() => {
    vi.clearAllMocks();
    sendMock = vi.fn().mockResolvedValue({}); // delete succeeds by default
    MockedSQSClient.prototype.send = sendMock;

    repo = { reconcileDeliveryStatus: vi.fn() } as any;
    service = new SesEventConsumerService(makeConfig() as any, repo as any);
  });

  it("reconciles a bounce and deletes the message", async () => {
    repo.reconcileDeliveryStatus.mockResolvedValue("matched");

    await service.processMessage(
      QUEUE_URL,
      sesMessage({ eventType: "Bounce", mail: { messageId: "ses-1" } }),
    );

    expect(repo.reconcileDeliveryStatus).toHaveBeenCalledWith(
      "ses-1",
      NotificationDeliveryStatus.BOUNCED,
    );
    expect(deletedReceipts()).toContain("receipt-1");
  });

  it("does NOT delete an unmatched event (leaves it for redelivery)", async () => {
    repo.reconcileDeliveryStatus.mockResolvedValue("unmatched");

    await service.processMessage(
      QUEUE_URL,
      sesMessage({ eventType: "Delivery", mail: { messageId: "race-1" } }),
    );

    expect(repo.reconcileDeliveryStatus).toHaveBeenCalled();
    expect(deletedReceipts()).not.toContain("receipt-1");
  });

  it("does NOT delete when reconciliation throws (retry path)", async () => {
    repo.reconcileDeliveryStatus.mockRejectedValue(new Error("db down"));

    await service.processMessage(
      QUEUE_URL,
      sesMessage({ eventType: "Bounce", mail: { messageId: "ses-2" } }),
    );

    expect(deletedReceipts()).not.toContain("receipt-1");
  });

  it("drops an untracked event type without touching the DB", async () => {
    await service.processMessage(
      QUEUE_URL,
      sesMessage({ eventType: "Open", mail: { messageId: "ses-3" } }),
    );

    expect(repo.reconcileDeliveryStatus).not.toHaveBeenCalled();
    expect(deletedReceipts()).toContain("receipt-1");
  });

  it("drops a malformed body without touching the DB", async () => {
    await service.processMessage(QUEUE_URL, sesMessage("}{ not json"));

    expect(repo.reconcileDeliveryStatus).not.toHaveBeenCalled();
    expect(deletedReceipts()).toContain("receipt-1");
  });

  it("stays inert on bootstrap when no queue URL is configured", () => {
    const disabled = new SesEventConsumerService(
      makeConfig("") as any,
      repo as any,
    );
    disabled.onApplicationBootstrap();
    // No poll loop started → no receive calls issued.
    expect(sendMock).not.toHaveBeenCalled();
  });
});
