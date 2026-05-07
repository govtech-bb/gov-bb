import { SqsConsumerService } from "./sqs-consumer.service";
import {
  SQSClient,
  ReceiveMessageCommand,
  DeleteMessageCommand,
} from "@aws-sdk/client-sqs";
import type { Message } from "@aws-sdk/client-sqs";

const MockedDeleteMessageCommand = DeleteMessageCommand as unknown as jest.Mock;
import type { ProcessorFactory } from "../processors/processor-factory.service";
import type { ISubmissionProcessor } from "../processors/submission-processor.interface";
import type { SubmissionSqsMessage } from "./submission-sqs-message.interface";

jest.mock("@aws-sdk/client-sqs");

const MockedSQSClient = SQSClient as jest.MockedClass<typeof SQSClient>;

/* Fixtures */

const QUEUE_URL =
  "https://sqs.ca-central-1.amazonaws.com/123/modular-forms-submissions-sandbox";

const BASE_MSG: SubmissionSqsMessage = {
  submissionId: "sub-001",
  processorType: "email",
  formId: "form-1",
  formVersion: "1.0.0",
  idempotencyKey: "idem-001",
  values: {},
  processors: [],
  meta: {
    schemaVersion: 1,
    pinnedFormVersion: "1.0.0",
    draftId: null,
    activeStepIds: [],
    hiddenStepIds: [],
    activeFieldIds: {},
    hiddenFieldIds: {},
    visitedPages: [],
    submittedAt: "2026-01-01T00:00:00.000Z",
  },
  enqueuedAt: "2026-01-01T00:00:00.000Z",
};

function sqsMessage(
  override: Partial<SubmissionSqsMessage> = {},
  receiveCount = "1",
): Message {
  return {
    MessageId: "msg-001",
    ReceiptHandle: "receipt-001",
    Body: JSON.stringify({ ...BASE_MSG, ...override }),
    Attributes: { ApproximateReceiveCount: receiveCount } as Record<
      string,
      string
    >,
  };
}

function makeConfig(enabled = true) {
  return {
    enabled,
    region: "ca-central-1",
    endpoint: undefined,
    queueUrl: QUEUE_URL,
  };
}

function makeProcessor(
  type = "email",
  processFn: jest.Mock = jest.fn().mockResolvedValue({ kind: "completed" }),
): ISubmissionProcessor {
  return {
    type,
    gatesPipeline: false,
    process: processFn,
  } as unknown as ISubmissionProcessor;
}

/* Tests */

describe("SqsConsumerService", () => {
  let sendMock: jest.Mock;
  let service: SqsConsumerService;
  let factory: jest.Mocked<Pick<ProcessorFactory, "resolveByType">>;

  beforeEach(() => {
    jest.clearAllMocks();
    sendMock = jest.fn();
    MockedSQSClient.prototype.send = sendMock;

    factory = {
      resolveByType: jest.fn(),
    } as any;

    service = new SqsConsumerService(makeConfig() as any, factory as any);
  });

  /* processMessage */

  describe("processMessage", () => {
    it("calls the resolved processor with the reconstructed event", async () => {
      const processor = makeProcessor();
      factory.resolveByType.mockReturnValue(processor);
      sendMock.mockResolvedValue({}); // delete succeeds

      await service.processMessage(QUEUE_URL, sqsMessage());

      expect(processor.process).toHaveBeenCalledTimes(1);
      const event = (processor.process as jest.Mock).mock.calls[0][0];
      expect(event.submissionId).toBe("sub-001");
      expect(event.formId).toBe("form-1");
    });

    it("resolves the processor using the processorType from the message body", async () => {
      const processor = makeProcessor("spreadsheet");
      factory.resolveByType.mockReturnValue(processor);
      sendMock.mockResolvedValue({});

      await service.processMessage(
        QUEUE_URL,
        sqsMessage({ processorType: "spreadsheet" }),
      );

      expect(factory.resolveByType).toHaveBeenCalledWith("spreadsheet");
    });

    it("deletes the message after successful processing", async () => {
      factory.resolveByType.mockReturnValue(makeProcessor());
      sendMock.mockResolvedValue({});

      await service.processMessage(QUEUE_URL, sqsMessage());

      // jest.mock auto-mocks the constructor — read args from mock.calls, not .input
      const deleteCallArgs = MockedDeleteMessageCommand.mock.calls.find(
        ([args]: [{ ReceiptHandle?: string }]) =>
          args.ReceiptHandle === "receipt-001",
      );
      expect(deleteCallArgs).toBeDefined();
    });

    it("does NOT delete the message when the processor throws (retry path)", async () => {
      const failing = makeProcessor(
        "email",
        jest.fn().mockRejectedValue(new Error("SES down")),
      );
      factory.resolveByType.mockReturnValue(failing);

      await service.processMessage(QUEUE_URL, sqsMessage());

      const deleteCalls = sendMock.mock.calls.filter(
        ([cmd]) => cmd instanceof DeleteMessageCommand,
      );
      expect(deleteCalls).toHaveLength(0);
    });

    it("deletes malformed JSON messages immediately without calling the processor", async () => {
      factory.resolveByType.mockReturnValue(makeProcessor());
      sendMock.mockResolvedValue({});

      const malformed: Message = {
        MessageId: "bad",
        ReceiptHandle: "bad-receipt",
        Body: "not-json{{",
        Attributes: { ApproximateReceiveCount: "1" },
      };

      await service.processMessage(QUEUE_URL, malformed);

      expect(factory.resolveByType).not.toHaveBeenCalled();
      const deleteCallArgs = MockedDeleteMessageCommand.mock.calls.find(
        ([args]: [{ ReceiptHandle?: string }]) =>
          args.ReceiptHandle === "bad-receipt",
      );
      expect(deleteCallArgs).toBeDefined();
    });

    it("deletes the message when no handler is registered for the processor type", async () => {
      factory.resolveByType.mockReturnValue(undefined);
      sendMock.mockResolvedValue({});

      await service.processMessage(
        QUEUE_URL,
        sqsMessage({ processorType: "unknown" }),
      );

      const deleteCalls = sendMock.mock.calls.filter(
        ([cmd]) => cmd instanceof DeleteMessageCommand,
      );
      expect(deleteCalls).toHaveLength(1);
    });

    it("logs a warning on retry attempts (receiveCount > 1)", async () => {
      const processor = makeProcessor();
      factory.resolveByType.mockReturnValue(processor);
      sendMock.mockResolvedValue({});

      const warnSpy = jest
        .spyOn((service as any).logger, "warn")
        .mockImplementation();

      await service.processMessage(QUEUE_URL, sqsMessage({}, "3"));

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining("Retry attempt #3"),
      );
    });

    it("reconstructs the full SubmissionCreatedEvent from the message", async () => {
      const processor = makeProcessor();
      factory.resolveByType.mockReturnValue(processor);
      sendMock.mockResolvedValue({});

      const msg = sqsMessage({
        values: { "step-1": { field: "value" } },
        formVersion: "2.0.0",
      });

      await service.processMessage(QUEUE_URL, msg);

      const event = (processor.process as jest.Mock).mock.calls[0][0];
      expect(event.values).toEqual({ "step-1": { field: "value" } });
      expect(event.formVersion).toBe("2.0.0");
      expect(event.idempotencyKey).toBe("idem-001");
    });
  });

  // ── lifecycle ───────────────────────────────────────────────────────────

  describe("onApplicationBootstrap", () => {
    it("does not start polling when SQS is disabled", () => {
      const disabledService = new SqsConsumerService(
        makeConfig(false) as any,
        factory as any,
      );
      const pollSpy = jest.spyOn(disabledService as any, "pollQueue");

      disabledService.onApplicationBootstrap();

      expect(pollSpy).not.toHaveBeenCalled();
    });

    it("starts a single polling loop for the shared queue when enabled", () => {
      const pollSpy = jest
        .spyOn(service as any, "pollQueue")
        .mockResolvedValue(undefined);

      service.onApplicationBootstrap();

      expect(pollSpy).toHaveBeenCalledTimes(1);
      expect(pollSpy).toHaveBeenCalledWith(QUEUE_URL);
    });
  });

  describe("onApplicationShutdown", () => {
    it("sets running to false to stop polling loops", () => {
      // Mock pollQueue so onApplicationBootstrap does not start a real loop
      // (which would create a dangling sleep timer and leak the worker process).
      jest.spyOn(service as any, "pollQueue").mockResolvedValue(undefined);

      service.onApplicationBootstrap();
      service.onApplicationShutdown();

      expect((service as any).running).toBe(false);
    });
  });
});
