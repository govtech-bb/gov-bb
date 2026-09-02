import type { Mock, Mocked, MockedClass } from "vitest";
import { SesEventConsumerService } from "./ses-event-consumer.service";
import {
  SQSClient,
  DeleteMessageCommand,
  ReceiveMessageCommand,
} from "@aws-sdk/client-sqs";
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

  it("passes a custom endpoint to the SQS client when configured", () => {
    const s = new SesEventConsumerService(
      {
        queueUrl: QUEUE_URL,
        region: "ca-central-1",
        endpoint: "http://localhost:4566",
      } as any,
      repo as any,
    );
    expect(s).toBeInstanceOf(SesEventConsumerService);
  });

  describe("pollQueue", () => {
    it("exits immediately when running is false", async () => {
      (service as any).running = false;
      await (service as any).pollQueue(QUEUE_URL);
      expect(sendMock).not.toHaveBeenCalled();
    });

    it("continues on an empty response, then stops", async () => {
      let iterations = 0;
      sendMock.mockImplementation(async () => {
        iterations++;
        (service as any).running = false;
        return { Messages: [] };
      });
      (service as any).running = true;
      await (service as any).pollQueue(QUEUE_URL);
      expect(iterations).toBe(1);
    });

    it("reconciles messages that arrive in the poll response", async () => {
      repo.reconcileDeliveryStatus.mockResolvedValue("matched");
      let n = 0;
      sendMock.mockImplementation(async (cmd: unknown) => {
        if (cmd instanceof ReceiveMessageCommand) {
          n++;
          if (n === 1)
            return {
              Messages: [
                sesMessage({
                  eventType: "Bounce",
                  mail: { messageId: "ses-x" },
                }),
              ],
            };
          (service as any).running = false;
          return { Messages: [] };
        }
        return {}; // DeleteMessageCommand response
      });
      (service as any).running = true;
      await (service as any).pollQueue(QUEUE_URL);
      expect(repo.reconcileDeliveryStatus).toHaveBeenCalledWith(
        "ses-x",
        NotificationDeliveryStatus.BOUNCED,
      );
    });

    it("backs off with sleep on a poll error", async () => {
      const sleepSpy = vi
        .spyOn(service as any, "sleep")
        .mockResolvedValue(undefined);
      let c = 0;
      sendMock.mockImplementation(async () => {
        c++;
        if (c === 1) throw new Error("SQS connection refused");
        (service as any).running = false;
        return { Messages: [] };
      });
      (service as any).running = true;
      await (service as any).pollQueue(QUEUE_URL);
      expect(sleepSpy).toHaveBeenCalledWith(5_000);
    });

    it("does not process a batch that arrives after shutdown was requested", async () => {
      sendMock.mockImplementation(async () => {
        (service as any).running = false;
        return {
          Messages: [
            sesMessage({ eventType: "Bounce", mail: { messageId: "late" } }),
          ],
        };
      });
      (service as any).running = true;
      await (service as any).pollQueue(QUEUE_URL);
      expect(repo.reconcileDeliveryStatus).not.toHaveBeenCalled();
    });
  });

  describe("lifecycle", () => {
    it("starts a poll loop when a queue URL is set", () => {
      const spy = vi
        .spyOn(service as any, "pollQueue")
        .mockResolvedValue(undefined);
      service.onApplicationBootstrap();
      expect(spy).toHaveBeenCalledTimes(1);
      expect((service as any).running).toBe(true);
    });

    it("sets running=false and destroys the client on shutdown", async () => {
      vi.spyOn(service as any, "pollQueue").mockResolvedValue(undefined);
      const destroySpy = vi.spyOn((service as any).client, "destroy");
      service.onApplicationBootstrap();
      await service.onApplicationShutdown();
      expect((service as any).running).toBe(false);
      expect(destroySpy).toHaveBeenCalledTimes(1);
    });

    it("awaits the in-flight loop before resolving (drain)", async () => {
      let finish!: () => void;
      const loop = new Promise<void>((r) => {
        finish = r;
      });
      vi.spyOn(service as any, "pollQueue").mockReturnValue(loop);
      service.onApplicationBootstrap();

      let resolved = false;
      const shutdown = service.onApplicationShutdown().then(() => {
        resolved = true;
      });
      await Promise.resolve();
      expect(resolved).toBe(false);

      finish();
      await shutdown;
      expect(resolved).toBe(true);
    });

    it("resolves even if the loop never settles (drain bounded by timeout)", async () => {
      vi.useFakeTimers();
      try {
        vi.spyOn(service as any, "pollQueue").mockReturnValue(
          new Promise<void>(() => {}),
        );
        const warnSpy = vi
          .spyOn((service as any).logger, "warn")
          .mockImplementation(() => {});
        service.onApplicationBootstrap();
        const shutdown = service.onApplicationShutdown();
        await vi.advanceTimersByTimeAsync(30_000);
        await shutdown;
        expect(warnSpy).toHaveBeenCalledWith(
          expect.stringContaining("drain timed out"),
        );
      } finally {
        vi.useRealTimers();
      }
    });

    it("shutdown without a prior bootstrap just destroys the client", async () => {
      const destroySpy = vi.spyOn((service as any).client, "destroy");
      await service.onApplicationShutdown();
      expect(destroySpy).toHaveBeenCalledTimes(1);
    });
  });
});
