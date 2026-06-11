import { BadRequestException, HttpStatus } from "@nestjs/common";
import {
  FormSubmissionEntity,
  FormSubmissionStatus,
} from "../../database/entities/form-submission.entity";
import { FormSubmissionRepository } from "./form-submission.repository";
import { SubmissionsService } from "./submissions.service";
import { SubmissionPipelineService } from "./submission-pipeline.service";
import { EventEmitter2 } from "@nestjs/event-emitter";
import { ProcessorFactory } from "./processors/processor-factory.service";
import type { ISubmissionProcessor } from "./processors/submission-processor.interface";
import type { SubmitDto } from "./submissions.types";
import type { ExpressionsService } from "../../expressions/expressions.service";

function makeExpressions(
  impl: (cfg: Record<string, unknown>) => Record<string, unknown> = (cfg) =>
    cfg,
) {
  return {
    resolveConfig: jest.fn(impl),
    resolveProcessors: jest.fn(
      (
        processors: Array<{ type: string; config: Record<string, unknown> }>,
        _ctx,
      ) => processors.map((p) => ({ ...p, config: impl(p.config) })),
    ),
  } as unknown as ExpressionsService;
}

const expressions = makeExpressions();

function makeEntity(
  overrides: Partial<FormSubmissionEntity> = {},
): FormSubmissionEntity {
  return {
    id: "uuid-sub-1",
    idempotencyKey: "key-abc",
    formId: "test-form",
    formVersion: "1.0.0",
    status: FormSubmissionStatus.SUBMITTED,
    values: { "step-1": { field1: "value1" } },
    meta: null,
    submittedAt: new Date("2026-04-01T00:00:00Z"),
    createdAt: new Date("2026-04-01T00:00:00Z"),
    updatedAt: new Date("2026-04-01T00:00:00Z"),
    ...overrides,
  } as FormSubmissionEntity;
}

const AUDIT_TRAIL = {
  schemaVersion: 1 as const,
  pinnedFormVersion: "1.0.0",
  draftId: "draft-001",
  activeStepIds: ["step-1"],
  hiddenStepIds: [],
  activeFieldIds: { "step-1": ["field1"] },
  hiddenFieldIds: {},
  visitedPages: [0],
  submittedAt: "2026-04-01T00:00:00.000Z",
};

interface MakeMocksOptions {
  existingEntity?: FormSubmissionEntity | null;
  gating?: ISubmissionProcessor[];
  nonGating?: ISubmissionProcessor[];
}

function makeMocks(options: MakeMocksOptions = {}) {
  const { existingEntity = null, gating = [], nonGating = [] } = options;

  const txRepo = {
    findOne: jest.fn().mockResolvedValue(null),
    create: jest.fn().mockImplementation((data) => ({ ...data })),
    save: jest.fn().mockResolvedValue(makeEntity()),
  };

  const submissionRepo = {
    findOne: jest.fn().mockResolvedValue(existingEntity),
    tx: jest.fn().mockImplementation((cb) => cb(txRepo)),
    count: jest.fn().mockResolvedValue(0),
  } as unknown as FormSubmissionRepository;

  const pipeline = {
    run: jest.fn().mockResolvedValue({
      draft: { formVersion: "1.0.0", lastActivePage: 0 },
      contract: { processors: [] },
      auditTrail: AUDIT_TRAIL,
    }),
  } as unknown as SubmissionPipelineService;

  const eventEmitter = {
    emit: jest.fn(),
  } as unknown as EventEmitter2;

  const processorFactory = {
    resolveSplit: jest.fn().mockReturnValue({ gating, nonGating }),
  } as unknown as ProcessorFactory;

  const service = new SubmissionsService(
    submissionRepo,
    pipeline,
    eventEmitter,
    processorFactory,
    expressions,
  );
  return {
    txRepo,
    submissionRepo,
    pipeline,
    eventEmitter,
    processorFactory,
    service,
  };
}

const BASE_DTO: SubmitDto = {
  idempotencyKey: "key-abc",
  formId: "test-form",
  formVersion: "1.0.0",
  draftId: "draft-001",
  values: { "step-1": { field1: "value1" } },
};

describe("SubmissionsService", () => {
  describe("submit", () => {
    it("throws BadRequestException when idempotencyKey is missing", async () => {
      const { service } = makeMocks();
      await expect(
        service.submit({ ...BASE_DTO, idempotencyKey: "" }),
      ).rejects.toThrow(BadRequestException);
    });

    it("throws BadRequestException when idempotencyKey is whitespace only", async () => {
      const { service } = makeMocks();
      await expect(
        service.submit({ ...BASE_DTO, idempotencyKey: "   " }),
      ).rejects.toThrow(BadRequestException);
    });

    it("creates a new submission when key is unique", async () => {
      const created = makeEntity();
      const { txRepo, service } = makeMocks();
      txRepo.save.mockResolvedValue(created);

      const result = await service.submit(BASE_DTO);

      expect(txRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          idempotencyKey: "key-abc",
          status: FormSubmissionStatus.SUBMITTED,
          submittedAt: expect.any(Date),
        }),
      );
      expect(result.outcome).toBe("created");
      expect(result.data).toBe(created);
    });

    it("emits submission.created event after successful create", async () => {
      const { service, eventEmitter } = makeMocks();
      await service.submit(BASE_DTO);
      expect(eventEmitter.emit as jest.Mock).toHaveBeenCalledWith(
        "submission.created",
        expect.objectContaining({
          submissionId: expect.any(String),
          idempotencyKey: "key-abc",
        }),
      );
    });

    it("emits the submission event with referenceCode set", async () => {
      const { service, eventEmitter } = makeMocks();
      await service.submit(BASE_DTO);
      expect(eventEmitter.emit as jest.Mock).toHaveBeenCalledWith(
        "submission.created",
        expect.objectContaining({
          referenceCode: expect.any(String),
        }),
      );
    });

    it("emits the submission event with raw processors (resolution happens in the listener)", async () => {
      const customExpressions = makeExpressions(() => ({ resolved: true }));
      const rawProcessors = [{ type: "email", config: { to: "raw@x" } }];
      const customPipeline = {
        run: jest.fn().mockResolvedValue({
          draft: { formVersion: "1.0.0", lastActivePage: 0 },
          contract: { processors: rawProcessors },
          auditTrail: AUDIT_TRAIL,
        }),
      } as unknown as SubmissionPipelineService;

      const txRepo = {
        findOne: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockImplementation((data) => ({ ...data })),
        save: jest.fn().mockResolvedValue(makeEntity({ id: "uuid-resolved" })),
      };
      const submissionRepo = {
        findOne: jest.fn().mockResolvedValue(null),
        tx: jest.fn().mockImplementation((cb) => cb(txRepo)),
        count: jest.fn().mockResolvedValue(0),
      } as unknown as FormSubmissionRepository;

      const eventEmitter = { emit: jest.fn() } as unknown as EventEmitter2;
      const processorFactory = {
        resolveSplit: jest.fn().mockReturnValue({ gating: [], nonGating: [] }),
      } as unknown as ProcessorFactory;

      const service = new SubmissionsService(
        submissionRepo,
        customPipeline,
        eventEmitter,
        processorFactory,
        customExpressions,
      );

      await service.submit(BASE_DTO);

      expect(
        customExpressions.resolveProcessors as jest.Mock,
      ).not.toHaveBeenCalled();

      expect(eventEmitter.emit as jest.Mock).toHaveBeenCalledWith(
        "submission.created",
        expect.objectContaining({ processors: rawProcessors }),
      );
    });

    it('returns outcome "duplicate" when key exists with non-processing status', async () => {
      const existing = makeEntity({ status: FormSubmissionStatus.COMPLETE });
      const { pipeline, service } = makeMocks({ existingEntity: existing });

      const result = await service.submit(BASE_DTO);

      expect(pipeline.run).not.toHaveBeenCalled();
      expect(result.outcome).toBe("duplicate");
      expect(result.data).toBe(existing);
    });

    it('returns outcome "in_progress" when key exists with PROCESSING status', async () => {
      const existing = makeEntity({ status: FormSubmissionStatus.PROCESSING });
      const { pipeline, service } = makeMocks({ existingEntity: existing });

      const result = await service.submit(BASE_DTO);

      expect(pipeline.run).not.toHaveBeenCalled();
      expect(result.outcome).toBe("in_progress");
      expect(result.data).toBe(existing);
    });

    it('returns outcome "duplicate" for SUBMITTED status', async () => {
      const { service } = makeMocks({
        existingEntity: makeEntity({ status: FormSubmissionStatus.SUBMITTED }),
      });
      const result = await service.submit(BASE_DTO);
      expect(result.outcome).toBe("duplicate");
    });

    it('returns outcome "duplicate" for ERROR status', async () => {
      const { service } = makeMocks({
        existingEntity: makeEntity({ status: FormSubmissionStatus.ERROR }),
      });
      const result = await service.submit(BASE_DTO);
      expect(result.outcome).toBe("duplicate");
    });

    it("uses dto.formVersion when draft is null (no draftId path)", async () => {
      // Branch: `draft?.formVersion ?? dto.formVersion` — draft is null
      const { txRepo, pipeline, service } = makeMocks();
      pipeline.run = jest.fn().mockResolvedValue({
        draft: null,
        contract: { processors: [] },
        auditTrail: AUDIT_TRAIL,
        normalizedValues: {},
      });

      const dto = { ...BASE_DTO, draftId: undefined };
      const result = await service.submit(dto);

      expect(result.outcome).toBe("created");
      expect(txRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ formVersion: BASE_DTO.formVersion }),
      );
    });

    it("uses empty processors array when contract.processors is undefined", async () => {
      // Branch: `contract.processors ?? []`
      const { processorFactory, pipeline, service } = makeMocks();
      pipeline.run = jest.fn().mockResolvedValue({
        draft: { formVersion: "1.0.0", lastActivePage: 0 },
        contract: { processors: undefined },
        auditTrail: AUDIT_TRAIL,
        normalizedValues: {},
      });

      await service.submit(BASE_DTO);

      // resolveSplit called with [] (the ?? fallback)
      expect(processorFactory.resolveSplit as jest.Mock).toHaveBeenCalledWith(
        [],
      );
    });

    it("returns the existing submission when double-check pessimistic write finds a race duplicate", async () => {
      // Branch: `if (doubleCheck)` inside the tx callback
      const doubleCheckEntity = makeEntity({ id: "race-entity" });
      const { service, submissionRepo } = makeMocks();

      // First findOne returns null (idempotency key not yet present)
      (submissionRepo.findOne as jest.Mock).mockResolvedValue(null);

      // Inside the tx, the pessimistic read finds a duplicate
      const txRepo = {
        findOne: jest.fn().mockResolvedValue(doubleCheckEntity),
        create: jest.fn(),
        save: jest.fn(),
      };
      (submissionRepo.tx as jest.Mock).mockImplementation((cb) => cb(txRepo));

      const result = await service.submit(BASE_DTO);

      expect(txRepo.create).not.toHaveBeenCalled();
      expect(result.data).toBe(doubleCheckEntity);
    });
  });

  describe("smoke submission (isSmokeSubmission drops processors)", () => {
    const rawProcessors = [
      { type: "email", config: { to: "school@mes.gov.bb" } },
      { type: "webhook", config: { url: "https://hook" } },
    ];

    function makeSmokeMocks() {
      const txRepo = {
        findOne: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockImplementation((data) => ({ ...data })),
        save: jest.fn().mockResolvedValue(makeEntity()),
      };
      const submissionRepo = {
        findOne: jest.fn().mockResolvedValue(null),
        tx: jest.fn().mockImplementation((cb) => cb(txRepo)),
        count: jest.fn().mockResolvedValue(0),
      } as unknown as FormSubmissionRepository;
      const pipeline = {
        run: jest.fn().mockResolvedValue({
          draft: { formVersion: "1.0.0", lastActivePage: 0 },
          contract: { processors: rawProcessors },
          auditTrail: AUDIT_TRAIL,
          normalizedValues: {},
        }),
      } as unknown as SubmissionPipelineService;
      const eventEmitter = { emit: jest.fn() } as unknown as EventEmitter2;
      // resolveSplit echoes its argument so we can prove the choke point fed []
      const processorFactory = {
        resolveSplit: jest.fn().mockImplementation((procs: unknown[]) => ({
          gating: [],
          nonGating: procs,
        })),
      } as unknown as ProcessorFactory;
      const service = new SubmissionsService(
        submissionRepo,
        pipeline,
        eventEmitter,
        processorFactory,
        expressions,
      );
      return { txRepo, service, eventEmitter, processorFactory };
    }

    it("feeds an empty processor list to resolveSplit when flag is set", async () => {
      const { service, processorFactory } = makeSmokeMocks();

      await service.submit({ ...BASE_DTO, isSmokeSubmission: true });

      expect(processorFactory.resolveSplit as jest.Mock).toHaveBeenCalledWith(
        [],
      );
    });

    it("emits submission.created carrying no processors when flag is set", async () => {
      const { service, eventEmitter } = makeSmokeMocks();

      await service.submit({ ...BASE_DTO, isSmokeSubmission: true });

      expect(eventEmitter.emit as jest.Mock).toHaveBeenCalledWith(
        "submission.created",
        expect.objectContaining({ processors: [] }),
      );
    });

    it("persists status SUBMITTED with submittedAt when flag is set", async () => {
      const { service, txRepo } = makeSmokeMocks();

      await service.submit({ ...BASE_DTO, isSmokeSubmission: true });

      expect(txRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          status: FormSubmissionStatus.SUBMITTED,
          submittedAt: expect.any(Date),
        }),
      );
    });

    it("does NOT drop processors when the flag is absent (unchanged path)", async () => {
      const { service, processorFactory } = makeSmokeMocks();

      await service.submit(BASE_DTO);

      expect(processorFactory.resolveSplit as jest.Mock).toHaveBeenCalledWith(
        rawProcessors,
      );
    });

    it("does NOT drop processors when the flag is explicitly false", async () => {
      const { service, processorFactory } = makeSmokeMocks();

      await service.submit({ ...BASE_DTO, isSmokeSubmission: false });

      expect(processorFactory.resolveSplit as jest.Mock).toHaveBeenCalledWith(
        rawProcessors,
      );
    });
  });

  describe("with gating processor present", () => {
    function makeGatingProcessor(
      kind: "deferred" | "completed" = "deferred",
      data?: {
        paymentUrl: string;
        paymentId: string;
        amount: number;
        description: string;
      },
    ): ISubmissionProcessor {
      return {
        type: "payment",
        gatesPipeline: true,
        process: jest.fn().mockResolvedValue(
          kind === "deferred"
            ? {
                kind: "deferred",
                data: data ?? {
                  paymentUrl: "https://pay.example/abc",
                  paymentId: "pay-1",
                  amount: 1000,
                  description: "Form fee",
                },
              }
            : { kind: "completed" },
        ),
      } as unknown as ISubmissionProcessor;
    }

    it("saves submission with PENDING_PAYMENT status and no submittedAt", async () => {
      const gating = makeGatingProcessor();
      const { txRepo, service } = makeMocks({ gating: [gating] });

      await service.submit(BASE_DTO);

      expect(txRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          idempotencyKey: "key-abc",
          status: FormSubmissionStatus.PENDING_PAYMENT,
        }),
      );
      const createArg = txRepo.create.mock.calls[0][0] as Record<
        string,
        unknown
      >;
      expect(createArg.submittedAt).toBeUndefined();
    });

    it("does NOT emit submission.created", async () => {
      const gating = makeGatingProcessor();
      const { service, eventEmitter } = makeMocks({ gating: [gating] });

      await service.submit(BASE_DTO);

      expect(eventEmitter.emit as jest.Mock).not.toHaveBeenCalled();
    });

    it("returns deferred payload with statusCode 200", async () => {
      const deferredData = {
        paymentUrl: "https://pay.example/xyz",
        paymentId: "pay-xyz",
        amount: 2500,
        description: "Application fee",
      };
      const gating = makeGatingProcessor("deferred", deferredData);
      const { service } = makeMocks({ gating: [gating] });

      const result = await service.submit(BASE_DTO);

      expect(result.outcome).toBe("created");
      expect(result.statusCode).toBe(HttpStatus.OK);
      expect(result.message).toBe("Payment required");
      expect(result.deferred).toEqual(deferredData);
    });

    it("calls each gating processor sequentially", async () => {
      const order: string[] = [];
      const first = {
        type: "payment",
        gatesPipeline: true,
        process: jest.fn().mockImplementation(async () => {
          order.push("first:start");
          await Promise.resolve();
          order.push("first:end");
          return {
            kind: "deferred",
            data: {
              paymentUrl: "u",
              paymentId: "p1",
              amount: 1,
              description: "d",
            },
          };
        }),
      } as unknown as ISubmissionProcessor;
      const second = {
        type: "payment",
        gatesPipeline: true,
        process: jest.fn().mockImplementation(async () => {
          order.push("second:start");
          await Promise.resolve();
          order.push("second:end");
          return { kind: "completed" };
        }),
      } as unknown as ISubmissionProcessor;

      const { service } = makeMocks({ gating: [first, second] });
      await service.submit(BASE_DTO);

      expect(first.process).toHaveBeenCalledTimes(1);
      expect(second.process).toHaveBeenCalledTimes(1);
      expect(order).toEqual([
        "first:start",
        "first:end",
        "second:start",
        "second:end",
      ]);
    });

    it("captures the FIRST deferred result when multiple gating processors return deferred", async () => {
      const firstData = {
        paymentUrl: "first",
        paymentId: "p1",
        amount: 1,
        description: "first",
      };
      const secondData = {
        paymentUrl: "second",
        paymentId: "p2",
        amount: 2,
        description: "second",
      };
      const first = makeGatingProcessor("deferred", firstData);
      const second = makeGatingProcessor("deferred", secondData);
      const { service } = makeMocks({ gating: [first, second] });

      const result = await service.submit(BASE_DTO);

      expect(result.deferred).toEqual(firstData);
      expect(second.process).toHaveBeenCalled();
    });

    it("propagates errors from gating processors", async () => {
      const failing = {
        type: "payment",
        gatesPipeline: true,
        process: jest.fn().mockRejectedValue(new Error("boom")),
      } as unknown as ISubmissionProcessor;
      const { service } = makeMocks({ gating: [failing] });

      await expect(service.submit(BASE_DTO)).rejects.toThrow("boom");
    });
  });
});
