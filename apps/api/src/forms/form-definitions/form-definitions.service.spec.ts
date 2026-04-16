import { NotFoundException } from "@nestjs/common";
import type { FormDefinitionEntity } from "../../database/entities/form-definition.entity";
import { FormDefinitionRepository } from "./form-definition.repository";
import { RegistryService } from "../../registry/registry.service";
import { FormDefinitionsService } from "./form-definitions.service";

const MOCK_RECIPE = {
  formId: "passport-renewal",
  title: "Passport Renewal",
  description: "Renew your passport",
  version: "1.0.0",
  createdAt: new Date("2026-01-01"),
  updatedAt: new Date("2026-01-01"),
  steps: [],
  processors: [],
};

const MOCK_HYDRATED = {
  ...MOCK_RECIPE,
  steps: [],
};

function makeEntity(
  overrides: Partial<FormDefinitionEntity> = {},
): FormDefinitionEntity {
  return {
    id: "uuid-1",
    formId: "passport-renewal",
    version: "1.0.0",
    schema: MOCK_RECIPE as unknown as Record<string, unknown>,
    publishedAt: null,
    createdAt: new Date("2026-01-01"),
    updatedAt: new Date("2026-01-01"),
    ...overrides,
  } as FormDefinitionEntity;
}

function makeMocks() {
  const repo = {
    findOne: jest.fn(),
  } as unknown as jest.Mocked<FormDefinitionRepository>;

  const registry = {
    hydrateForm: jest.fn().mockResolvedValue(MOCK_HYDRATED),
  } as unknown as jest.Mocked<RegistryService>;

  const service = new FormDefinitionsService(repo, registry);
  return { repo, registry, service };
}

describe("FormDefinitionsService", () => {
  describe("findByFormId", () => {
    it("returns the latest hydrated form when no version is given", async () => {
      const { repo, registry, service } = makeMocks();
      (repo.findOne as jest.Mock).mockResolvedValue(makeEntity());

      const result = await service.findByFormId({ formId: "passport-renewal" });

      expect(repo.findOne).toHaveBeenCalledWith({
        where: { formId: "passport-renewal" },
        order: { createdAt: "DESC" },
      });
      expect(registry.hydrateForm).toHaveBeenCalledWith(MOCK_RECIPE);
      expect(result).toEqual(MOCK_HYDRATED);
    });

    it("returns a specific version when version is given", async () => {
      const { repo, registry, service } = makeMocks();
      (repo.findOne as jest.Mock).mockResolvedValue(makeEntity());

      const result = await service.findByFormId({
        formId: "passport-renewal",
        version: "1.0.0",
      });

      expect(repo.findOne).toHaveBeenCalledWith({
        where: { formId: "passport-renewal", version: "1.0.0" },
        order: { createdAt: "DESC" },
      });
      expect(registry.hydrateForm).toHaveBeenCalled();
      expect(result).toEqual(MOCK_HYDRATED);
    });

    it("throws NotFoundException when formId is not found", async () => {
      const { repo, service } = makeMocks();
      (repo.findOne as jest.Mock).mockResolvedValue(null);

      await expect(service.findByFormId({ formId: "ghost" })).rejects.toThrow(
        NotFoundException,
      );
    });

    it("throws NotFoundException when formId + version is not found", async () => {
      const { repo, service } = makeMocks();
      (repo.findOne as jest.Mock).mockResolvedValue(null);

      await expect(
        service.findByFormId({ formId: "ghost", version: "9.9.9" }),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
