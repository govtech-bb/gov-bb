import { BadRequestException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { FormSubmissionEntity, FormSubmissionStatus } from '../../database/entities/form-submission.entity';
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

function makeMocks() {
  const repo = {
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
  } as unknown as jest.Mocked<Repository<FormSubmissionEntity>>;

  const service = new SubmissionsService(repo);
  return { repo, service };
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

    it('creates a new submission when key is not found', async () => {
      const { repo, service } = makeMocks();
      const created = makeEntity();
      (repo.findOne as jest.Mock).mockResolvedValue(null);
      (repo.create as jest.Mock).mockReturnValue(created);
      (repo.save as jest.Mock).mockResolvedValue(created);

      const result = await service.submit(BASE_DTO);

      expect(repo.findOne).toHaveBeenCalledWith({ where: { idempotencyKey: 'key-abc' } });
      expect(repo.create).toHaveBeenCalledWith(expect.objectContaining({
        idempotencyKey: 'key-abc',
        status: FormSubmissionStatus.SUBMITTED,
        submittedAt: expect.any(Date),
      }));
      expect(repo.save).toHaveBeenCalledWith(created);
      expect(result.outcome).toBe('created');
      expect(result.data).toBe(created);
    });

    it('returns outcome "duplicate" without reprocessing when key exists', async () => {
      const { repo, service } = makeMocks();
      const existing = makeEntity({ status: FormSubmissionStatus.COMPLETE });
      (repo.findOne as jest.Mock).mockResolvedValue(existing);

      const result = await service.submit(BASE_DTO);

      expect(repo.create).not.toHaveBeenCalled();
      expect(repo.save).not.toHaveBeenCalled();
      expect(result.outcome).toBe('duplicate');
      expect(result.data).toBe(existing);
    });

    it('returns outcome "in_progress" when key exists with PROCESSING status', async () => {
      const { repo, service } = makeMocks();
      const existing = makeEntity({ status: FormSubmissionStatus.PROCESSING });
      (repo.findOne as jest.Mock).mockResolvedValue(existing);

      const result = await service.submit(BASE_DTO);

      expect(repo.create).not.toHaveBeenCalled();
      expect(repo.save).not.toHaveBeenCalled();
      expect(result.outcome).toBe('in_progress');
      expect(result.data).toBe(existing);
    });

    it('returns outcome "duplicate" for SUBMITTED status', async () => {
      const { repo, service } = makeMocks();
      (repo.findOne as jest.Mock).mockResolvedValue(makeEntity({ status: FormSubmissionStatus.SUBMITTED }));
      const result = await service.submit(BASE_DTO);
      expect(result.outcome).toBe('duplicate');
    });

    it('returns outcome "duplicate" for ERROR status', async () => {
      const { repo, service } = makeMocks();
      (repo.findOne as jest.Mock).mockResolvedValue(makeEntity({ status: FormSubmissionStatus.ERROR }));
      const result = await service.submit(BASE_DTO);
      expect(result.outcome).toBe('duplicate');
    });
  });
});
