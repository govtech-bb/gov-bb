import { SubmissionProcessorListener } from "./submission-processor.listener";
import type { ProcessorFactory } from "./processors/processor-factory.service";
import type { ISubmissionProcessor } from "./processors/submission-processor.interface";
import type { SubmissionCreatedEvent } from "./submissions.types";

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

    const listener = new SubmissionProcessorListener(factory);

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

    const listener = new SubmissionProcessorListener(factory);

    await listener.handleSubmissionCreated(EVENT);

    expect(failing.process).toHaveBeenCalledTimes(1);
    expect(succeeding.process).toHaveBeenCalledTimes(1);
  });
});
