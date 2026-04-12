import { NotFoundException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { FormDefinitionEntity } from '../../database/entities/form-definition.entity';
import { RegistryService } from '../../registry/registry.service';
import { FormDefinitionsService } from './form-definitions.service';

const MOCK_RECIPE = {
  formId: 'passport-renewal',
  title: 'Passport Renewal',
  description: 'Renew your passport',
  version: '1.0.0',
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
  steps: [],
  processors: [],
};

const MOCK_HYDRATED = {
  ...MOCK_RECIPE,
  steps: [],
};

function makeEntity(overrides: Partial<FormDefinitionEntity> = {}): FormDefinitionEntity {
  return {
    id: 'uuid-1',
    formId: 'passport-renewal',
    version: '1.0.0',
    schema: MOCK_RECIPE as unknown as Record<string, unknown>,
    publishedAt: null,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    ...overrides,
  } as FormDefinitionEntity;
}

function makeMocks() {
  const repo = {
    findOne: jest.fn(),
  } as unknown as jest.Mocked<Repository<FormDefinitionEntity>>;

  const registry = {
    hydrateForm: jest.fn().mockResolvedValue(MOCK_HYDRATED),
  } as unknown as jest.Mocked<RegistryService>;

  const service = new FormDefinitionsService(repo, registry);
  return { repo, registry, service };
}

describe('FormDefinitionsService', () => {
  describe('findById', () => {
    it('returns a hydrated form for a valid ID', async () => {
      const { repo, registry, service } = makeMocks();
      (repo.findOne as jest.Mock).mockResolvedValue(makeEntity());

      const result = await service.findById('uuid-1');

      expect(repo.findOne).toHaveBeenCalledWith({ where: { id: 'uuid-1' } });
      expect(registry.hydrateForm).toHaveBeenCalledWith(MOCK_RECIPE);
      expect(result).toEqual(MOCK_HYDRATED);
    });

    it('throws NotFoundException for an unknown ID', async () => {
      const { repo, service } = makeMocks();
      (repo.findOne as jest.Mock).mockResolvedValue(null);

      await expect(service.findById('unknown')).rejects.toThrow(NotFoundException);
    });
  });

  describe('findByFormIdAndVersion', () => {
    it('returns a hydrated form for a valid formId + version', async () => {
      const { repo, registry, service } = makeMocks();
      (repo.findOne as jest.Mock).mockResolvedValue(makeEntity());

      const result = await service.findByFormIdAndVersion('passport-renewal', '1.0.0');

      expect(repo.findOne).toHaveBeenCalledWith({
        where: { formId: 'passport-renewal', version: '1.0.0' },
      });
      expect(registry.hydrateForm).toHaveBeenCalled();
      expect(result).toEqual(MOCK_HYDRATED);
    });

    it('throws NotFoundException for an unknown formId + version', async () => {
      const { repo, service } = makeMocks();
      (repo.findOne as jest.Mock).mockResolvedValue(null);

      await expect(
        service.findByFormIdAndVersion('ghost', '9.9.9'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('findLatestByFormId', () => {
    it('returns the latest hydrated form for a valid formId', async () => {
      const { repo, registry, service } = makeMocks();
      (repo.findOne as jest.Mock).mockResolvedValue(makeEntity());

      const result = await service.findLatestByFormId('passport-renewal');

      expect(repo.findOne).toHaveBeenCalledWith({
        where: { formId: 'passport-renewal' },
        order: { createdAt: 'DESC' },
      });
      expect(registry.hydrateForm).toHaveBeenCalled();
      expect(result).toEqual(MOCK_HYDRATED);
    });

    it('throws NotFoundException for an unknown formId', async () => {
      const { repo, service } = makeMocks();
      (repo.findOne as jest.Mock).mockResolvedValue(null);

      await expect(
        service.findLatestByFormId('ghost'),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
