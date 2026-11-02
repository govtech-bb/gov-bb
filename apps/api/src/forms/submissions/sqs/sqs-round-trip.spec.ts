import type { Mock, MockedClass } from "vitest";
import { SQSClient, SendMessageCommand } from "@aws-sdk/client-sqs";
import type { Message } from "@aws-sdk/client-sqs";
import { SqsProducerService } from "./sqs-producer.service";
import { SqsConsumerService } from "./sqs-consumer.service";
import type { SubmissionCreatedEvent } from "../submissions.types";

vi.mock("@aws-sdk/client-sqs");

const MockedSQSClient = SQSClient as MockedClass<typeof SQSClient>;
const MockedSendMessageCommand = SendMessageCommand as unknown as Mock;

const QUEUE_URL =
  "https://sqs.ca-central-1.amazonaws.com/123/modular-forms-submissions-sandbox";

/**
 * Every field of SubmissionCreatedEvent, set. `Required<>` makes a field added
 * to the event a compile error here until it is filled in, so it is also
 * checked to survive the queue hop. #3349: `payment` and `isSmokeSubmission`
 * were silently dropped because the producer copies fields one by one.
 */
const FULL_EVENT: Required<SubmissionCreatedEvent> = {
  submissionId: "sub-001",
  referenceCode: "GBC-2610-ABC1234",
  formId: "get-birth-certificate",
  formVersion: "1.0.0",
  idempotencyKey: "idem-001",
  processors: [
    { type: "email", config: { recipientField: "applicant.email" } },
    { type: "email", config: { recipientField: "config.mdaEmail" } },
  ],
  values: { applicant: { email: "citizen@example.com" } },
  meta: {
    schemaVersion: 1,
    pinnedFormVersion: "1.0.0",
    draftId: null,
    activeStepIds: ["applicant"],
    hiddenStepIds: [],
    activeFieldIds: {},
    hiddenFieldIds: {},
    visitedPages: [0],
    submittedAt: "2026-10-27T00:00:00.000Z",
  },
  processorIndex: 1,
  isSmokeSubmission: true,
  payment: { amountReceived: "$5.00", transactionId: "EZP-123456" },
  resolvedCatchment: {
    polyclinic: "Winston Scott",
    programmeCode: "EH-WS",
    polyclinicContact: "Winston Scott Polyclinic, 536-0000, ws@example.gov.bb",
  },
};

describe("SQS round trip (producer → consumer)", () => {
  let sendMock: Mock;

  beforeEach(() => {
    vi.clearAllMocks();
    sendMock = vi.fn().mockResolvedValue({ MessageId: "msg-1" });
    MockedSQSClient.prototype.send = sendMock;
  });

  /** Enqueue `event` with the real producer, then hand the exact body it
   *  wrote to the real consumer and return the event the processor receives. */
  async function roundTrip(
    event: SubmissionCreatedEvent,
    processorIndex: number,
  ): Promise<SubmissionCreatedEvent> {
    const producer = new SqsProducerService({
      enabled: true,
      region: "ca-central-1",
      endpoint: undefined,
      queueUrl: QUEUE_URL,
    } as any);
    await producer.enqueue(event, "email", processorIndex);
    const body = MockedSendMessageCommand.mock.calls[0][0].MessageBody;

    const process = vi.fn().mockResolvedValue({ kind: "completed" });
    const consumer = new SqsConsumerService(
      {
        enabled: true,
        region: "ca-central-1",
        endpoint: undefined,
        queueUrl: QUEUE_URL,
        maxReceiveCount: 3,
      } as any,
      {
        resolveByType: () => ({ type: "email", gatesPipeline: false, process }),
      } as any,
      { notify: vi.fn() } as any,
    );
    const message: Message = {
      MessageId: "msg-1",
      ReceiptHandle: "receipt-1",
      Body: body,
      Attributes: { ApproximateReceiveCount: "1" },
    };
    await consumer.processMessage(QUEUE_URL, message);

    expect(process).toHaveBeenCalledTimes(1);
    return process.mock.calls[0][0] as SubmissionCreatedEvent;
  }

  it("delivers every event field to the processor unchanged", async () => {
    const received = await roundTrip(FULL_EVENT, FULL_EVENT.processorIndex);

    expect(received).toEqual(FULL_EVENT);
  });

  it("carries the payment summary, so the MDA email shows the EzPay details (#3349)", async () => {
    const received = await roundTrip(FULL_EVENT, 1);

    expect(received.payment).toEqual({
      amountReceived: "$5.00",
      transactionId: "EZP-123456",
    });
  });

  it("carries isSmokeSubmission, so smoke runs stay side-effect free", async () => {
    const received = await roundTrip(FULL_EVENT, 1);

    expect(received.isSmokeSubmission).toBe(true);
  });

  it("leaves payment and isSmokeSubmission absent on an ordinary submission", async () => {
    const {
      payment: _payment,
      isSmokeSubmission: _smoke,
      ...ordinary
    } = FULL_EVENT;

    const received = await roundTrip(ordinary, 0);

    expect(received).not.toHaveProperty("payment");
    expect(received).not.toHaveProperty("isSmokeSubmission");
  });
});
