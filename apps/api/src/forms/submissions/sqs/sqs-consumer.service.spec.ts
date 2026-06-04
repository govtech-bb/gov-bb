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
  processorIndex: 0,
  formId: "form-1",
  formVersion: "1.0.0",
  idempotencyKey: "idem-001",
  values: {},
  processors: [{ type: "email", config: { recipientField: "test@gov.bb" } }],
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

    it("deletes a message whose `values` is not a plain object (defensive shape guard)", async () => {
      factory.resolveByType.mockReturnValue(makeProcessor());
      sendMock.mockResolvedValue({});

      const malformed: Message = {
        MessageId: "bad-shape",
        ReceiptHandle: "bad-shape-receipt",
        Body: JSON.stringify({
          processorType: "email",
          submissionId: "s",
          formId: "f",
          formVersion: "1",
          idempotencyKey: "i",
          values: "not-an-object",
          meta: {},
          processors: [],
        }),
        Attributes: { ApproximateReceiveCount: "1" },
      };

      await service.processMessage(QUEUE_URL, malformed);

      expect(factory.resolveByType).not.toHaveBeenCalled();
      const deleteCallArgs = MockedDeleteMessageCommand.mock.calls.find(
        ([args]: [{ ReceiptHandle?: string }]) =>
          args.ReceiptHandle === "bad-shape-receipt",
      );
      expect(deleteCallArgs).toBeDefined();
    });

    it("deletes a message whose `values` is null (null guard branch)", async () => {
      // Branch: `payload.values === null`
      factory.resolveByType.mockReturnValue(makeProcessor());
      sendMock.mockResolvedValue({});

      const malformed: Message = {
        MessageId: "null-values",
        ReceiptHandle: "null-values-receipt",
        Body: JSON.stringify({
          processorType: "email",
          submissionId: "s",
          formId: "f",
          formVersion: "1",
          idempotencyKey: "i",
          values: null,
          meta: {},
          processors: [],
        }),
        Attributes: { ApproximateReceiveCount: "1" },
      };

      await service.processMessage(QUEUE_URL, malformed);

      expect(factory.resolveByType).not.toHaveBeenCalled();
      const deleteCallArgs = MockedDeleteMessageCommand.mock.calls.find(
        ([args]: [{ ReceiptHandle?: string }]) =>
          args.ReceiptHandle === "null-values-receipt",
      );
      expect(deleteCallArgs).toBeDefined();
    });

    it("deletes a message whose `values` is an array (array guard branch)", async () => {
      // Branch: `Array.isArray(payload.values)`
      factory.resolveByType.mockReturnValue(makeProcessor());
      sendMock.mockResolvedValue({});

      const malformed: Message = {
        MessageId: "array-values",
        ReceiptHandle: "array-values-receipt",
        Body: JSON.stringify({
          processorType: "email",
          submissionId: "s",
          formId: "f",
          formVersion: "1",
          idempotencyKey: "i",
          values: [{ field: "val" }],
          meta: {},
          processors: [],
        }),
        Attributes: { ApproximateReceiveCount: "1" },
      };

      await service.processMessage(QUEUE_URL, malformed);

      expect(factory.resolveByType).not.toHaveBeenCalled();
      const deleteCallArgs = MockedDeleteMessageCommand.mock.calls.find(
        ([args]: [{ ReceiptHandle?: string }]) =>
          args.ReceiptHandle === "array-values-receipt",
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

    it("defaults receiveCount to 1 when Attributes are absent", async () => {
      // Branch: `message.Attributes?.[...] ?? "1"` — the ?? "1" fallback
      const processor = makeProcessor();
      factory.resolveByType.mockReturnValue(processor);
      sendMock.mockResolvedValue({});

      const msgWithoutAttrs: Message = {
        MessageId: "no-attrs",
        ReceiptHandle: "no-attrs-receipt",
        Body: JSON.stringify(BASE_MSG),
        // No Attributes field at all
      };

      await service.processMessage(QUEUE_URL, msgWithoutAttrs);

      // Should have processed normally (receiveCount defaulted to 1, no warning)
      expect(processor.process).toHaveBeenCalledTimes(1);
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

    it("passes the processorIndex from the message onto the reconstructed event", async () => {
      const processor = makeProcessor();
      factory.resolveByType.mockReturnValue(processor);
      sendMock.mockResolvedValue({});

      await service.processMessage(
        QUEUE_URL,
        sqsMessage({
          processorIndex: 1,
          processors: [
            { type: "email", config: { recipientField: "test@gov.bb" } },
            { type: "email", config: { recipientField: "test@gov.bb" } },
          ],
        }),
      );

      const event = (processor.process as jest.Mock).mock.calls[0][0];
      expect(event.processorIndex).toBe(1);
    });

    it("deletes a message missing processorIndex without invoking the processor (drained-queue guard)", async () => {
      factory.resolveByType.mockReturnValue(makeProcessor());
      sendMock.mockResolvedValue({});

      await service.processMessage(
        QUEUE_URL,
        sqsMessage({ processorIndex: undefined }),
      );

      expect(factory.resolveByType).not.toHaveBeenCalled();
      const deleteCallArgs = MockedDeleteMessageCommand.mock.calls.find(
        ([args]: [{ ReceiptHandle?: string }]) =>
          args.ReceiptHandle === "receipt-001",
      );
      expect(deleteCallArgs).toBeDefined();
    });

    it("deletes a message missing the processors array without throwing (corrupted-body guard)", async () => {
      factory.resolveByType.mockReturnValue(makeProcessor());
      sendMock.mockResolvedValue({});

      const corrupted: Message = {
        MessageId: "no-processors",
        ReceiptHandle: "no-processors-receipt",
        Body: JSON.stringify({
          processorType: "email",
          processorIndex: 0,
          submissionId: "s",
          formId: "f",
          formVersion: "1",
          idempotencyKey: "i",
          values: {},
          meta: {},
          // processors omitted entirely
        }),
        Attributes: { ApproximateReceiveCount: "1" },
      };

      await expect(
        service.processMessage(QUEUE_URL, corrupted),
      ).resolves.toBeUndefined();

      expect(factory.resolveByType).not.toHaveBeenCalled();
      const deleteCallArgs = MockedDeleteMessageCommand.mock.calls.find(
        ([args]: [{ ReceiptHandle?: string }]) =>
          args.ReceiptHandle === "no-processors-receipt",
      );
      expect(deleteCallArgs).toBeDefined();
    });

    it("deletes a message whose processorIndex is out of range without invoking the processor", async () => {
      factory.resolveByType.mockReturnValue(makeProcessor());
      sendMock.mockResolvedValue({});

      await service.processMessage(
        QUEUE_URL,
        sqsMessage({
          processorIndex: 5,
          processors: [
            { type: "email", config: { recipientField: "test@gov.bb" } },
          ],
        }),
      );

      expect(factory.resolveByType).not.toHaveBeenCalled();
      const deleteCallArgs = MockedDeleteMessageCommand.mock.calls.find(
        ([args]: [{ ReceiptHandle?: string }]) =>
          args.ReceiptHandle === "receipt-001",
      );
      expect(deleteCallArgs).toBeDefined();
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

  describe("pollQueue (internal loop, line 60-83)", () => {
    it("exits immediately when running is false", async () => {
      (service as any).running = false;
      await (service as any).pollQueue(QUEUE_URL);
      expect(sendMock).not.toHaveBeenCalled();
    });

    it("continues polling loop on empty response (no messages branch)", async () => {
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

    it("processes messages when they arrive in the poll response", async () => {
      factory.resolveByType.mockReturnValue(makeProcessor());
      let callCount = 0;

      sendMock.mockImplementation(async (cmd: any) => {
        // First ReceiveMessageCommand call returns a message, then stop
        if (
          cmd.constructor?.name === "ReceiveMessageCommand" ||
          callCount === 0
        ) {
          callCount++;
          if (callCount === 1) {
            (service as any).running = false;
            return { Messages: [sqsMessage()] };
          }
        }
        return {}; // DeleteMessageCommand response
      });

      (service as any).running = true;
      await (service as any).pollQueue(QUEUE_URL);

      expect(factory.resolveByType).toHaveBeenCalled();
    });

    it("backs off with sleep on poll error (catch branch + sleep)", async () => {
      const sleepSpy = jest
        .spyOn(service as any, "sleep")
        .mockResolvedValue(undefined);

      let callCount = 0;
      sendMock.mockImplementation(async () => {
        callCount++;
        if (callCount === 1) throw new Error("SQS connection refused");
        // Second call: stop the loop
        (service as any).running = false;
        return { Messages: [] };
      });

      (service as any).running = true;
      await (service as any).pollQueue(QUEUE_URL);

      expect(sleepSpy).toHaveBeenCalledWith(5_000);
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
