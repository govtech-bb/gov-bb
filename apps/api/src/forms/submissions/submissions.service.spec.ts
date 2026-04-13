import { BadRequestException } from '@nestjs/common';
import { FormSubmissionEntity, FormSubmissionStatus } from '../../database/entities/form-submission.entity';
import { FormSubmissionRepository } from './form-submission.repository';
import { SubmissionsService } from './submissions.service';

function makeEntity(overrides: Partial<FormSubmissionEntity> = {}): FormSubmissionEntity {
  return {
    id: 'uuid-sub-1',
    idempotencyKey: 'key-abc',
    formId: 'test-form',
    formVersion: '1.0.0',
    status: FormSubmissionStatus.SUBMITTED,
    values: { field1: 'value1' },
    meta: null,
    submittedAt: new Date('2026-04-01T00:00:00Z'),
    createdAt: new Date('2026-04-01T00:00:00Z'),
    updatedAt: new Date('2026-04-01T00:00:00Z'),
    ...overrides,
  } as FormSubmissionEntity;
}

function makeMocks(existingEntity: FormSubmissionEntity | null = null, savedEntity?: FormSubmissionEntity) {
  const txRepo = {
    findOne: jest.fn().mockResolvedValue(existingEntity),
    create: jest.fn().mockImplementation((data) => ({ ...data })),
    save: jest.fn().mockResolvedValue(savedEntity ?? makeEntity()),
  };

  const submissionRepo = {
    tx: jest.fn().mockImplementation((cb) => cb(txRepo)),
  } as unknown as FormSubmissionRepository;

  const service = new SubmissionsService(submissionRepo);
  return { txRepo, submissionRepo, service };
}

const BASE_DTO = {
  idempotencyKey: 'key-abc',
  formId: 'test-form',
  formVersion: '1.0.0',
  values: { field1: 'value1' },
};

describe('SubmissionsService', () => {
  describe('submit', () => {
    it('throws BadRequestException when idempotencyKey is missing', async () => {
      const { service } = makeMocks();
      await expect(service.submit({ ...BASE_DTO, idempotencyKey: '' })).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when idempotencyKey is whitespace only', async () => {
      const { service } = makeMocks();
      await expect(service.submit({ ...BASE_DTO, idempotencyKey: '   ' })).rejects.toThrow(BadRequestException);
    });

    it('creates a new submission when key is unique', async () => {
      const created = makeEntity();
      const { txRepo, service } = makeMocks(null, created);

      const result = await service.submit(BASE_DTO);

      expect(txRepo.create).toHaveBeenCalledWith(expect.objectContaining({
        idempotencyKey: 'key-abc',
        status: FormSubmissionStatus.SUBMITTED,
        submittedAt: expect.any(Date),
      }));
      expect(result.outcome).toBe('created');
      expect(result.data).toBe(created);
    });

    it('returns outcome "duplicate" when key exists with non-processing status', async () => {
      const existing = makeEntity({ status: FormSubmissionStatus.COMPLETE });
      const { txRepo, service } = makeMocks(existing);

      const result = await service.submit(BASE_DTO);

      expect(txRepo.save).not.toHaveBeenCalled();
      expect(result.outcome).toBe('duplicate');
      expect(result.data).toBe(existing);
    });

    it('returns outcome "in_progress" when key exists with PROCESSING status', async () => {
      const existing = makeEntity({ status: FormSubmissionStatus.PROCESSING });
      const { txRepo, service } = makeMocks(existing);

      const result = await service.submit(BASE_DTO);

      expect(txRepo.save).not.toHaveBeenCalled();
      expect(result.outcome).toBe('in_progress');
      expect(result.data).toBe(existing);
    });

    it('returns outcome "duplicate" for SUBMITTED status', async () => {
      const { service } = makeMocks(makeEntity({ status: FormSubmissionStatus.SUBMITTED }));
      const result = await service.submit(BASE_DTO);
      expect(result.outcome).toBe('duplicate');
    });

    it('returns outcome "duplicate" for ERROR status', async () => {
      const { service } = makeMocks(makeEntity({ status: FormSubmissionStatus.ERROR }));
      const result = await service.submit(BASE_DTO);
      expect(result.outcome).toBe('duplicate');
    });
  });
});
