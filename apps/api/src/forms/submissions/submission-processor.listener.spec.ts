import { SubmissionProcessorListener } from "./submission-processor.listener";
import type { ProcessorFactory } from "./processors/processor-factory.service";
import type { ISubmissionProcessor } from "./processors/submission-processor.interface";
import type { SqsProducerService } from "./sqs/sqs-producer.service";
import type { SubmissionCreatedEvent } from "./submissions.types";
import type { Processor } from "@govtech-bb/form-types";
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
  referenceCode: "TST-20260604-130732-000001",
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

/** Build an event whose frozen processors[] snapshot drives per-entry dispatch. */
function eventWith(processors: Processor[]): SubmissionCreatedEvent {
  return { ...EVENT, processors };
}

/** A minimal processors[] entry of the given type — config shape is irrelevant
 *  to dispatch (handlers read it, the listener only routes by type). */
function entry(type: string): Processor {
  return { type, config: {} } as unknown as Processor;
}

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

/** Factory that resolves handlers positionally by type (the new dispatch grain). */
function makeFactory(handlers: ISubmissionProcessor[]): ProcessorFactory {
  const registry = new Map<string, ISubmissionProcessor>(
    handlers.map((h) => [h.type, h]),
  );
  return {
    resolveByType: jest.fn((type: string) => registry.get(type)),
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
  it("runs each non-gating entry directly, tagged with its processorIndex", async () => {
    const email = makeProcessor("email");
    const listener = makeListener(makeFactory([email]), makeProducer(), false);

    await listener.handleSubmissionCreated(eventWith([entry("email")]));

    expect(email.process).toHaveBeenCalledTimes(1);
    expect(email.process).toHaveBeenCalledWith(
      expect.objectContaining({ submissionId: "sub-1", processorIndex: 0 }),
    );
  });

  it("dispatches each same-type entry with its own positional index", async () => {
    const email = makeProcessor("email");
    const listener = makeListener(makeFactory([email]), makeProducer(), false);

    await listener.handleSubmissionCreated(
      eventWith([entry("email"), entry("email")]),
    );

    expect(email.process).toHaveBeenCalledTimes(2);
    const indices = (email.process as jest.Mock).mock.calls.map(
      ([e]) => e.processorIndex,
    );
    expect(indices).toEqual([0, 1]);
  });

  it("skips gating entries on the direct path", async () => {
    const payment = makeProcessor("payment", true);
    const listener = makeListener(
      makeFactory([payment]),
      makeProducer(),
      false,
    );

    await listener.handleSubmissionCreated(eventWith([entry("payment")]));

    expect(payment.process).not.toHaveBeenCalled();
  });

  it("skips entries whose type has no registered handler, preserving sibling indices", async () => {
    const email = makeProcessor("email");
    const listener = makeListener(makeFactory([email]), makeProducer(), false);

    await listener.handleSubmissionCreated(
      eventWith([entry("ghost"), entry("email")]),
    );

    // "ghost" has no handler; "email" is at snapshot index 1 and must keep it.
    expect(email.process).toHaveBeenCalledTimes(1);
    expect(email.process).toHaveBeenCalledWith(
      expect.objectContaining({ processorIndex: 1 }),
    );
  });

  it("continues running subsequent entries when one fails", async () => {
    const failing = makeProcessor(
      "email",
      false,
      jest.fn().mockRejectedValue(new Error("smtp down")),
    );
    const succeeding = makeProcessor("spreadsheet");
    const listener = makeListener(
      makeFactory([failing, succeeding]),
      makeProducer(),
      false,
    );

    await listener.handleSubmissionCreated(
      eventWith([entry("email"), entry("spreadsheet")]),
    );

    expect(failing.process).toHaveBeenCalledTimes(1);
    expect(succeeding.process).toHaveBeenCalledTimes(1);
  });

  it("does not call the SQS producer when SQS is disabled", async () => {
    const producer = makeProducer();
    const listener = makeListener(
      makeFactory([makeProcessor("email")]),
      producer,
      false,
    );

    await listener.handleSubmissionCreated(eventWith([entry("email")]));

    expect(producer.enqueue).not.toHaveBeenCalled();
  });
});

/* Tests — SQS enabled (enqueue path) */

describe("SubmissionProcessorListener — SQS enabled", () => {
  it("enqueues each non-gating entry with its type and positional index", async () => {
    const email = makeProcessor("email");
    const spreadsheet = makeProcessor("spreadsheet");
    const producer = makeProducer();
    const listener = makeListener(
      makeFactory([email, spreadsheet]),
      producer,
      true,
    );

    await listener.handleSubmissionCreated(
      eventWith([entry("email"), entry("spreadsheet")]),
    );

    expect(producer.enqueue).toHaveBeenCalledTimes(2);
    expect(producer.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({ submissionId: "sub-1" }),
      "email",
      0,
    );
    expect(producer.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({ submissionId: "sub-1" }),
      "spreadsheet",
      1,
    );
  });

  it("enqueues N messages with distinct indices for N same-type entries", async () => {
    const email = makeProcessor("email");
    const producer = makeProducer();
    const listener = makeListener(makeFactory([email]), producer, true);

    await listener.handleSubmissionCreated(
      eventWith([entry("email"), entry("email"), entry("email")]),
    );

    expect(producer.enqueue).toHaveBeenCalledTimes(3);
    const indices = producer.enqueue.mock.calls.map(([, , i]) => i);
    expect(indices).toEqual([0, 1, 2]);
  });

  it("does not call processor.process directly when SQS is enabled", async () => {
    const email = makeProcessor("email");
    const listener = makeListener(makeFactory([email]), makeProducer(), true);

    await listener.handleSubmissionCreated(eventWith([entry("email")]));

    expect(email.process).not.toHaveBeenCalled();
  });

  it("does not enqueue gating entries", async () => {
    const payment = makeProcessor("payment", true);
    const producer = makeProducer();
    const listener = makeListener(makeFactory([payment]), producer, true);

    await listener.handleSubmissionCreated(eventWith([entry("payment")]));

    expect(producer.enqueue).not.toHaveBeenCalled();
    expect(payment.process).not.toHaveBeenCalled();
  });

  it("skips entries with no registered handler when enqueuing, preserving sibling indices", async () => {
    const email = makeProcessor("email");
    const producer = makeProducer();
    const listener = makeListener(makeFactory([email]), producer, true);

    await listener.handleSubmissionCreated(
      eventWith([entry("ghost"), entry("email")]),
    );

    expect(producer.enqueue).toHaveBeenCalledTimes(1);
    expect(producer.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({ submissionId: "sub-1" }),
      "email",
      1,
    );
  });

  it("continues enqueuing subsequent entries when one enqueue fails", async () => {
    const email = makeProcessor("email");
    const spreadsheet = makeProcessor("spreadsheet");
    const producer = makeProducer();
    producer.enqueue
      .mockRejectedValueOnce(new Error("SQS unavailable"))
      .mockResolvedValueOnce(undefined);

    const listener = makeListener(
      makeFactory([email, spreadsheet]),
      producer,
      true,
    );

    await listener.handleSubmissionCreated(
      eventWith([entry("email"), entry("spreadsheet")]),
    );

    expect(producer.enqueue).toHaveBeenCalledTimes(2);
  });

  it("handles a submission with no processors without error", async () => {
    const producer = makeProducer();
    const listener = makeListener(makeFactory([]), producer, true);

    await expect(
      listener.handleSubmissionCreated(eventWith([])),
    ).resolves.toBeUndefined();
    expect(producer.enqueue).not.toHaveBeenCalled();
  });
});

/* Tests — Expressions resolution */

describe("SubmissionProcessorListener — expressions resolution", () => {
  it("resolves processor configs and dispatches the resolved, indexed payload", async () => {
    const transformingExpressions = {
      resolveProcessors: jest.fn((processors: Array<{ type: string }>) =>
        processors.map((p) => ({ ...p, config: { resolved: true } })),
      ),
    } as unknown as ExpressionsService;

    const emailStub = makeProcessor("email", false);
    const factory = makeFactory([emailStub]);
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
      ] as unknown as Processor[],
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
        processorIndex: 0,
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
      makeFactory([email]),
      producer,
      makeSqsConfig(false) as any,
      failingExpressions,
    );

    await expect(
      l.handleSubmissionCreated(eventWith([entry("email")])),
    ).resolves.toBeUndefined();

    expect(email.process).not.toHaveBeenCalled();
    expect(producer.enqueue).not.toHaveBeenCalled();
  });
});
