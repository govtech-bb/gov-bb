import { SubmissionProcessorListener } from "./submission-processor.listener";
import type { ProcessorFactory } from "./processors/processor-factory.service";
import type { ISubmissionProcessor } from "./processors/submission-processor.interface";
import type { SqsProducerService } from "./sqs/sqs-producer.service";
import type { SubmissionCreatedEvent } from "./submissions.types";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const EVENT: SubmissionCreatedEvent = {
  submissionId: "sub-1",
  formId: "form-1",
  formVersion: "1.0.0",
  idempotencyKey: "key-1",
  processors: [],
  values: {},
  meta: {
    schemaVersion: 1,
    pinnedFormVersion: "1.0.0",
    draftId: "draft-1",
    activeStepIds: [],
    hiddenStepIds: [],
    activeFieldIds: {},
    hiddenFieldIds: {},
    visitedPages: [],
    submittedAt: "2026-04-01T00:00:00.000Z",
  },
};

function makeProcessor(
  type: string,
  gates = false,
  process: jest.Mock = jest.fn().mockResolvedValue({ kind: "completed" }),
): ISubmissionProcessor {
  return {
    type,
    gatesPipeline: gates,
    process,
  } as unknown as ISubmissionProcessor;
}

function makeFactory(
  gating: ISubmissionProcessor[],
  nonGating: ISubmissionProcessor[],
): ProcessorFactory {
  return {
    resolveSplit: jest.fn().mockReturnValue({ gating, nonGating }),
  } as unknown as ProcessorFactory;
}

function makeProducer(): jest.Mocked<SqsProducerService> {
  return { enqueue: jest.fn().mockResolvedValue(undefined) } as any;
}

function makeSqsConfig(enabled: boolean) {
  return { enabled };
}

// ---------------------------------------------------------------------------
// Tests — SQS disabled (direct execution path)
// ---------------------------------------------------------------------------

describe("SubmissionProcessorListener — SQS disabled", () => {
  it("runs only non-gating processors directly", async () => {
    const email = makeProcessor("email");
    const payment = makeProcessor("payment", true);
    const listener = new SubmissionProcessorListener(
      makeFactory([payment], [email]),
      makeProducer(),
      makeSqsConfig(false) as any,
    );

    await listener.handleSubmissionCreated(EVENT);

    expect(email.process).toHaveBeenCalledTimes(1);
    expect(payment.process).not.toHaveBeenCalled();
  });

  it("continues running subsequent processors when one fails", async () => {
    const failing = makeProcessor(
      "email",
      false,
      jest.fn().mockRejectedValue(new Error("smtp down")),
    );
    const succeeding = makeProcessor("spreadsheet");
    const listener = new SubmissionProcessorListener(
      makeFactory([], [failing, succeeding]),
      makeProducer(),
      makeSqsConfig(false) as any,
    );

    await listener.handleSubmissionCreated(EVENT);

    expect(failing.process).toHaveBeenCalledTimes(1);
    expect(succeeding.process).toHaveBeenCalledTimes(1);
  });

  it("does not call the SQS producer when SQS is disabled", async () => {
    const producer = makeProducer();
    const listener = new SubmissionProcessorListener(
      makeFactory([], [makeProcessor("email")]),
      producer,
      makeSqsConfig(false) as any,
    );

    await listener.handleSubmissionCreated(EVENT);

    expect(producer.enqueue).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Tests — SQS enabled (enqueue path)
// ---------------------------------------------------------------------------

describe("SubmissionProcessorListener — SQS enabled", () => {
  it("enqueues each non-gating processor via the SQS producer", async () => {
    const email = makeProcessor("email");
    const spreadsheet = makeProcessor("spreadsheet");
    const producer = makeProducer();
    const listener = new SubmissionProcessorListener(
      makeFactory([], [email, spreadsheet]),
      producer,
      makeSqsConfig(true) as any,
    );

    await listener.handleSubmissionCreated(EVENT);

    expect(producer.enqueue).toHaveBeenCalledTimes(2);
    expect(producer.enqueue).toHaveBeenCalledWith(EVENT, "email");
    expect(producer.enqueue).toHaveBeenCalledWith(EVENT, "spreadsheet");
  });

  it("does not call processor.process directly when SQS is enabled", async () => {
    const email = makeProcessor("email");
    const listener = new SubmissionProcessorListener(
      makeFactory([], [email]),
      makeProducer(),
      makeSqsConfig(true) as any,
    );

    await listener.handleSubmissionCreated(EVENT);

    expect(email.process).not.toHaveBeenCalled();
  });

  it("does not enqueue gating processors", async () => {
    const payment = makeProcessor("payment", true);
    const producer = makeProducer();
    const listener = new SubmissionProcessorListener(
      makeFactory([payment], []),
      producer,
      makeSqsConfig(true) as any,
    );

    await listener.handleSubmissionCreated(EVENT);

    expect(producer.enqueue).not.toHaveBeenCalled();
    expect(payment.process).not.toHaveBeenCalled();
  });

  it("continues enqueuing subsequent processors when one enqueue fails", async () => {
    const email = makeProcessor("email");
    const spreadsheet = makeProcessor("spreadsheet");
    const producer = makeProducer();
    producer.enqueue
      .mockRejectedValueOnce(new Error("SQS unavailable"))
      .mockResolvedValueOnce(undefined);

    const listener = new SubmissionProcessorListener(
      makeFactory([], [email, spreadsheet]),
      producer,
      makeSqsConfig(true) as any,
    );

    await listener.handleSubmissionCreated(EVENT);

    expect(producer.enqueue).toHaveBeenCalledTimes(2);
  });

  it("handles a submission with no non-gating processors without error", async () => {
    const producer = makeProducer();
    const listener = new SubmissionProcessorListener(
      makeFactory([], []),
      producer,
      makeSqsConfig(true) as any,
    );

    await expect(
      listener.handleSubmissionCreated(EVENT),
    ).resolves.toBeUndefined();
    expect(producer.enqueue).not.toHaveBeenCalled();
  });
});
