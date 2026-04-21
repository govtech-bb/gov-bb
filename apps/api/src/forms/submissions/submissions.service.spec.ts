import { BadRequestException } from "@nestjs/common";
import {
  FormSubmissionEntity,
  FormSubmissionStatus,
} from "../../database/entities/form-submission.entity";
import { FormSubmissionRepository } from "./form-submission.repository";
import { SubmissionsService } from "./submissions.service";
import { SubmissionPipelineService } from "./submission-pipeline.service";
import { EventEmitter2 } from "@nestjs/event-emitter";
import type { SubmitDto } from "./submissions.types";

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

function makeMocks(existingEntity: FormSubmissionEntity | null = null) {
  const txRepo = {
    findOne: jest.fn().mockResolvedValue(null),
    create: jest.fn().mockImplementation((data) => ({ ...data })),
    save: jest.fn().mockResolvedValue(makeEntity()),
  };

  const submissionRepo = {
    findOne: jest.fn().mockResolvedValue(existingEntity),
    tx: jest.fn().mockImplementation((cb) => cb(txRepo)),
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

  const service = new SubmissionsService(
    submissionRepo,
    pipeline,
    eventEmitter,
  );
  return { txRepo, submissionRepo, pipeline, eventEmitter, service };
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
      const { txRepo, service } = makeMocks(null);
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
      const { service, eventEmitter } = makeMocks(null);
      await service.submit(BASE_DTO);
      expect(eventEmitter.emit as jest.Mock).toHaveBeenCalledWith(
        "submission.created",
        expect.objectContaining({ submissionId: expect.any(String) }),
      );
    });

    it('returns outcome "duplicate" when key exists with non-processing status', async () => {
      const existing = makeEntity({ status: FormSubmissionStatus.COMPLETE });
      const { pipeline, service } = makeMocks(existing);

      const result = await service.submit(BASE_DTO);

      expect(pipeline.run).not.toHaveBeenCalled();
      expect(result.outcome).toBe("duplicate");
      expect(result.data).toBe(existing);
    });

    it('returns outcome "in_progress" when key exists with PROCESSING status', async () => {
      const existing = makeEntity({ status: FormSubmissionStatus.PROCESSING });
      const { pipeline, service } = makeMocks(existing);

      const result = await service.submit(BASE_DTO);

      expect(pipeline.run).not.toHaveBeenCalled();
      expect(result.outcome).toBe("in_progress");
      expect(result.data).toBe(existing);
    });

    it('returns outcome "duplicate" for SUBMITTED status', async () => {
      const { service } = makeMocks(
        makeEntity({ status: FormSubmissionStatus.SUBMITTED }),
      );
      const result = await service.submit(BASE_DTO);
      expect(result.outcome).toBe("duplicate");
    });

    it('returns outcome "duplicate" for ERROR status', async () => {
      const { service } = makeMocks(
        makeEntity({ status: FormSubmissionStatus.ERROR }),
      );
      const result = await service.submit(BASE_DTO);
      expect(result.outcome).toBe("duplicate");
    });
  });
});
