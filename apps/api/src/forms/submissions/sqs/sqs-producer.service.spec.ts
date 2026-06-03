import { SqsProducerService } from "./sqs-producer.service";
import { SQSClient, SendMessageCommand } from "@aws-sdk/client-sqs";
import type { SubmissionCreatedEvent } from "../submissions.types";

jest.mock("@aws-sdk/client-sqs");

const MockedSQSClient = SQSClient as jest.MockedClass<typeof SQSClient>;
const MockedSendMessageCommand = SendMessageCommand as jest.MockedClass<
  typeof SendMessageCommand
>;

const QUEUE_URL =
  "https://sqs.ca-central-1.amazonaws.com/672203047922/modular-forms-submissions-sandbox";

const EVENT: SubmissionCreatedEvent = {
  submissionId: "sub-001",
  formId: "form-1",
  formVersion: "1.0.0",
  idempotencyKey: "idem-001",
  processors: [],
  values: { "step-1": { name: "Jane" } },
  meta: {
    schemaVersion: 1,
    pinnedFormVersion: "1.0.0",
    draftId: null,
    activeStepIds: ["step-1"],
    hiddenStepIds: [],
    activeFieldIds: {},
    hiddenFieldIds: {},
    visitedPages: [0],
    submittedAt: "2026-01-01T00:00:00.000Z",
  },
};

function makeService(
  overrides: Partial<{ enabled: boolean; endpoint: string }> = {},
) {
  const config = {
    enabled: true,
    region: "ca-central-1",
    endpoint: overrides.endpoint,
    queueUrl: QUEUE_URL,
  };
  return new SqsProducerService(config as any);
}

describe("SqsProducerService", () => {
  let sendMock: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    sendMock = jest.fn().mockResolvedValue({ MessageId: "msg-xyz" });
    MockedSQSClient.prototype.send = sendMock;
  });

  it("sends a SendMessageCommand to the shared queue URL", async () => {
    const service = makeService();
    await service.enqueue(EVENT, "email", 0);

    expect(sendMock).toHaveBeenCalledTimes(1);
    const [command] = sendMock.mock.calls[0];
    expect(command).toBeInstanceOf(MockedSendMessageCommand);
  });

  it("always uses the single shared queue URL regardless of processor type", async () => {
    const service = makeService();

    for (const type of ["email", "spreadsheet", "opencrvs"]) {
      jest.clearAllMocks();
      sendMock = jest.fn().mockResolvedValue({ MessageId: "msg-xyz" });
      MockedSQSClient.prototype.send = sendMock;

      await service.enqueue(EVENT, type, 0);

      const [cmd] = MockedSendMessageCommand.mock.calls[0];
      expect(cmd.QueueUrl).toBe(QUEUE_URL);
    }
  });

  it("serialises the full event payload into the message body", async () => {
    const service = makeService();
    await service.enqueue(EVENT, "email", 0);

    const [cmd] = MockedSendMessageCommand.mock.calls[0];
    const body = JSON.parse(cmd.MessageBody as string);

    expect(body.submissionId).toBe("sub-001");
    expect(body.processorType).toBe("email");
    expect(body.formId).toBe("form-1");
    expect(body.idempotencyKey).toBe("idem-001");
    expect(body.enqueuedAt).toBeDefined();
  });

  it("includes MessageAttributes for submissionId and processorType", async () => {
    const service = makeService();
    await service.enqueue(EVENT, "spreadsheet", 0);

    const [cmd] = MockedSendMessageCommand.mock.calls[0];
    expect(cmd.MessageAttributes?.submissionId?.StringValue).toBe("sub-001");
    expect(cmd.MessageAttributes?.processorType?.StringValue).toBe(
      "spreadsheet",
    );
  });

  it("embeds the processorType in the message body for consumer routing", async () => {
    const service = makeService();
    await service.enqueue(EVENT, "opencrvs", 0);

    const [cmd] = MockedSendMessageCommand.mock.calls[0];
    const body = JSON.parse(cmd.MessageBody as string);
    expect(body.processorType).toBe("opencrvs");
  });

  it("serialises the processorIndex into the message body", async () => {
    const service = makeService();
    await service.enqueue(EVENT, "email", 2);

    const [cmd] = MockedSendMessageCommand.mock.calls[0];
    const body = JSON.parse(cmd.MessageBody as string);
    expect(body.processorIndex).toBe(2);
  });

  it("includes the processorIndex as a Number MessageAttribute", async () => {
    const service = makeService();
    await service.enqueue(EVENT, "email", 3);

    const [cmd] = MockedSendMessageCommand.mock.calls[0];
    expect(cmd.MessageAttributes?.processorIndex?.DataType).toBe("Number");
    expect(cmd.MessageAttributes?.processorIndex?.StringValue).toBe("3");
  });

  it("constructs the SQS client with a custom endpoint when provided", () => {
    makeService({ endpoint: "http://localhost:4566" });

    const clientConfig = MockedSQSClient.mock.calls[0]?.[0];
    expect(clientConfig?.endpoint).toBe("http://localhost:4566");
  });

  it("constructs the SQS client without endpoint when not provided", () => {
    makeService();

    const clientConfig = MockedSQSClient.mock.calls[0]?.[0];
    expect(clientConfig?.endpoint).toBeUndefined();
  });

  it("serialises the full values and meta into the message body", async () => {
    const service = makeService();
    await service.enqueue(EVENT, "email", 0);

    const [cmd] = MockedSendMessageCommand.mock.calls[0];
    const body = JSON.parse(cmd.MessageBody as string);

    expect(body.values).toEqual({ "step-1": { name: "Jane" } });
    expect(body.meta.submittedAt).toBe("2026-01-01T00:00:00.000Z");
  });
});
