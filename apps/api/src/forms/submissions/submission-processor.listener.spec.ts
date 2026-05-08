import { SubmissionProcessorListener } from "./submission-processor.listener";
import type { ProcessorFactory } from "./processors/processor-factory.service";
import type { ISubmissionProcessor } from "./processors/submission-processor.interface";
import type { SqsProducerService } from "./sqs/sqs-producer.service";
import type { SubmissionCreatedEvent } from "./submissions.types";
import type { ExpressionsService } from "../../expressions/expressions.service";

/* Default expressions stub — resolveProcessors is a pass-through */
const expressions = {
  resolveConfig: jest.fn((cfg: Record<string, unknown>) => cfg),
  resolveProcessors: jest.fn(
    (processors: Array<{ type: string; config: Record<string, unknown> }>) =>
      processors,
  ),
} as unknown as ExpressionsService;

/* Fixtures */

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

function makeListener(
  factory: ProcessorFactory,
  producer: jest.Mocked<SqsProducerService>,
  sqsEnabled: boolean,
  exprs: ExpressionsService = expressions,
): SubmissionProcessorListener {
  return new SubmissionProcessorListener(
    factory,
    producer,
    makeSqsConfig(sqsEnabled) as any,
    exprs,
  );
}

/* Tests — SQS disabled (direct execution path) */

describe("SubmissionProcessorListener — SQS disabled", () => {
  it("runs only non-gating processors directly", async () => {
    const email = makeProcessor("email");
    const payment = makeProcessor("payment", true);
    const listener = makeListener(
      makeFactory([payment], [email]),
      makeProducer(),
      false,
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
    const listener = makeListener(
      makeFactory([], [failing, succeeding]),
      makeProducer(),
      false,
    );

    await listener.handleSubmissionCreated(EVENT);

    expect(failing.process).toHaveBeenCalledTimes(1);
    expect(succeeding.process).toHaveBeenCalledTimes(1);
  });

  it("does not call the SQS producer when SQS is disabled", async () => {
    const producer = makeProducer();
    const listener = makeListener(
      makeFactory([], [makeProcessor("email")]),
      producer,
      false,
    );

    await listener.handleSubmissionCreated(EVENT);

    expect(producer.enqueue).not.toHaveBeenCalled();
  });
});

/* Tests — SQS enabled (enqueue path) */

describe("SubmissionProcessorListener — SQS enabled", () => {
  it("enqueues each non-gating processor via the SQS producer", async () => {
    const email = makeProcessor("email");
    const spreadsheet = makeProcessor("spreadsheet");
    const producer = makeProducer();
    const listener = makeListener(
      makeFactory([], [email, spreadsheet]),
      producer,
      true,
    );

    await listener.handleSubmissionCreated(EVENT);

    expect(producer.enqueue).toHaveBeenCalledTimes(2);
    expect(producer.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({ submissionId: "sub-1" }),
      "email",
    );
    expect(producer.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({ submissionId: "sub-1" }),
      "spreadsheet",
    );
  });

  it("does not call processor.process directly when SQS is enabled", async () => {
    const email = makeProcessor("email");
    const listener = makeListener(
      makeFactory([], [email]),
      makeProducer(),
      true,
    );

    await listener.handleSubmissionCreated(EVENT);

    expect(email.process).not.toHaveBeenCalled();
  });

  it("does not enqueue gating processors", async () => {
    const payment = makeProcessor("payment", true);
    const producer = makeProducer();
    const listener = makeListener(makeFactory([payment], []), producer, true);

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

    const listener = makeListener(
      makeFactory([], [email, spreadsheet]),
      producer,
      true,
    );

    await listener.handleSubmissionCreated(EVENT);

    expect(producer.enqueue).toHaveBeenCalledTimes(2);
  });

  it("handles a submission with no non-gating processors without error", async () => {
    const producer = makeProducer();
    const listener = makeListener(makeFactory([], []), producer, true);

    await expect(
      listener.handleSubmissionCreated(EVENT),
    ).resolves.toBeUndefined();
    expect(producer.enqueue).not.toHaveBeenCalled();
  });
});

/* Tests — Expressions resolution */

describe("SubmissionProcessorListener — expressions resolution", () => {
  it("resolves processor configs and dispatches the resolved payload", async () => {
    const transformingExpressions = {
      resolveProcessors: jest.fn((processors: Array<{ type: string }>) =>
        processors.map((p) => ({ ...p, config: { resolved: true } })),
      ),
    } as unknown as ExpressionsService;

    const emailStub = makeProcessor("email", false);
    const factory = makeFactory([], [emailStub]);
    const l = new SubmissionProcessorListener(
      factory,
      makeProducer(),
      makeSqsConfig(false) as any,
      transformingExpressions,
    );

    await l.handleSubmissionCreated({
      ...EVENT,
      processors: [
        { type: "email", config: { recipientField: "personal.email" } },
      ],
    });

    expect(
      transformingExpressions.resolveProcessors as jest.Mock,
    ).toHaveBeenCalledWith(
      [{ type: "email", config: { recipientField: "personal.email" } }],
      expect.objectContaining({
        submission: expect.objectContaining({ id: "sub-1" }),
      }),
    );

    expect(emailStub.process).toHaveBeenCalledWith(
      expect.objectContaining({
        processors: [{ type: "email", config: { resolved: true } }],
      }),
    );
  });

  it("short-circuits dispatch when resolveProcessors throws", async () => {
    const failingExpressions = {
      resolveProcessors: jest.fn().mockImplementation(() => {
        throw new Error("bad expression");
      }),
    } as unknown as ExpressionsService;

    const email = makeProcessor("email");
    const producer = makeProducer();
    const l = new SubmissionProcessorListener(
      makeFactory([], [email]),
      producer,
      makeSqsConfig(false) as any,
      failingExpressions,
    );

    await expect(l.handleSubmissionCreated(EVENT)).resolves.toBeUndefined();

    expect(email.process).not.toHaveBeenCalled();
    expect(producer.enqueue).not.toHaveBeenCalled();
  });
});
