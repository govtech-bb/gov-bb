import { SubmissionProcessorListener } from "./submission-processor.listener";
import type { ProcessorFactory } from "./processors/processor-factory.service";
import type { ISubmissionProcessor } from "./processors/submission-processor.interface";
import type { SubmissionCreatedEvent } from "./submissions.types";
import type { ExpressionsService } from "../../expressions/expressions.service";

const expressions = {
  resolveConfig: jest.fn((cfg: Record<string, unknown>) => cfg),
  resolveProcessors: jest.fn(
    (processors: Array<{ type: string; config: Record<string, unknown> }>) =>
      processors,
  ),
} as unknown as ExpressionsService;

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

describe("SubmissionProcessorListener", () => {
  it("runs only non-gating processors", async () => {
    const emailStub = makeProcessor("email", false);
    const paymentStub = makeProcessor("payment", true);

    const factory = {
      resolveSplit: jest
        .fn()
        .mockReturnValue({ gating: [paymentStub], nonGating: [emailStub] }),
    } as unknown as ProcessorFactory;

    const listener = new SubmissionProcessorListener(factory, expressions);

    await listener.handleSubmissionCreated(EVENT);

    expect(emailStub.process).toHaveBeenCalledTimes(1);
    expect(paymentStub.process).not.toHaveBeenCalled();
  });

  it("runs each non-gating processor sequentially and continues on errors", async () => {
    const failing = makeProcessor(
      "email",
      false,
      jest.fn().mockRejectedValue(new Error("smtp down")),
    );
    const succeeding = makeProcessor("spreadsheet", false);

    const factory = {
      resolveSplit: jest
        .fn()
        .mockReturnValue({ gating: [], nonGating: [failing, succeeding] }),
    } as unknown as ProcessorFactory;

    const listener = new SubmissionProcessorListener(factory, expressions);

    await listener.handleSubmissionCreated(EVENT);

    expect(failing.process).toHaveBeenCalledTimes(1);
    expect(succeeding.process).toHaveBeenCalledTimes(1);
  });

  it("resolves processor configs and dispatches the resolved payload", async () => {
    const transformingExpressions = {
      resolveProcessors: jest.fn((processors: Array<{ type: string }>) =>
        processors.map((p) => ({ ...p, config: { resolved: true } })),
      ),
    } as unknown as ExpressionsService;

    const emailStub = makeProcessor("email", false);
    const factory = {
      resolveSplit: jest
        .fn()
        .mockReturnValue({ gating: [], nonGating: [emailStub] }),
    } as unknown as ProcessorFactory;

    const listener = new SubmissionProcessorListener(
      factory,
      transformingExpressions,
    );

    await listener.handleSubmissionCreated({
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
});
