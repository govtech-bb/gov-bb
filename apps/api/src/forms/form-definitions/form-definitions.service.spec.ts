import { NotFoundException } from "@nestjs/common";
import type { FormDefinitionEntity } from "../../database/entities/form-definition.entity";
import { FormDefinitionRepository } from "./form-definition.repository";
import { RegistryService } from "../../registry/registry.service";
import { RecipeFileLoader } from "../recipe-file-loader/recipe-file-loader.service";
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

const { processors: _processors, ...MOCK_HYDRATED_STRIPPED } = MOCK_HYDRATED;

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

  const loader = {
    findLatest: jest.fn().mockReturnValue(null),
    findVersion: jest.fn().mockReturnValue(null),
  } as unknown as jest.Mocked<RecipeFileLoader>;

  const service = new FormDefinitionsService(repo, registry, loader);
  return { repo, registry, loader, service };
}

describe("FormDefinitionsService", () => {
  describe("findByFormId — file-loader path", () => {
    it("returns the latest hydrated form from the file loader without hitting the DB", async () => {
      const { repo, registry, loader, service } = makeMocks();
      (loader.findLatest as jest.Mock).mockReturnValue(MOCK_RECIPE);

      const result = await service.findByFormId({ formId: "passport-renewal" });

      expect(loader.findLatest).toHaveBeenCalledWith("passport-renewal");
      expect(repo.findOne).not.toHaveBeenCalled();
      expect(registry.hydrateForm).toHaveBeenCalledWith(MOCK_RECIPE);
      expect(result).toEqual(MOCK_HYDRATED_STRIPPED);
    });

    it("returns a specific version from the file loader when version is given", async () => {
      const { repo, registry, loader, service } = makeMocks();
      (loader.findVersion as jest.Mock).mockReturnValue(MOCK_RECIPE);

      const result = await service.findByFormId({
        formId: "passport-renewal",
        version: "1.0.0",
      });

      expect(loader.findVersion).toHaveBeenCalledWith(
        "passport-renewal",
        "1.0.0",
      );
      expect(loader.findLatest).not.toHaveBeenCalled();
      expect(repo.findOne).not.toHaveBeenCalled();
      expect(registry.hydrateForm).toHaveBeenCalledWith(MOCK_RECIPE);
      expect(result).toEqual(MOCK_HYDRATED_STRIPPED);
    });
  });

  describe("findByFormId — DB fallback", () => {
    let warnSpy: jest.SpyInstance;

    beforeEach(() => {
      warnSpy = jest
        .spyOn(
          // Nest's Logger writes through the static logger service; spy on console.warn
          // via the logger's underlying transport. Spy on the prototype instead so we
          // verify the WARN is emitted regardless of console transport.
          require("@nestjs/common").Logger.prototype,
          "warn",
        )
        .mockImplementation(() => undefined);
    });

    afterEach(() => {
      warnSpy.mockRestore();
    });

    it("falls back to DB when the loader has no entry and logs a warning", async () => {
      const { repo, registry, loader, service } = makeMocks();
      (loader.findLatest as jest.Mock).mockReturnValue(null);
      (repo.findOne as jest.Mock).mockResolvedValue(makeEntity());

      const result = await service.findByFormId({ formId: "passport-renewal" });

      expect(loader.findLatest).toHaveBeenCalledWith("passport-renewal");
      expect(repo.findOne).toHaveBeenCalledWith({
        where: { formId: "passport-renewal" },
        order: { createdAt: "DESC" },
      });
      expect(warnSpy).toHaveBeenCalled();
      expect(registry.hydrateForm).toHaveBeenCalledWith(MOCK_RECIPE);
      expect(result).toEqual(MOCK_HYDRATED_STRIPPED);
    });

    it("falls back to DB for a specific version when the loader has no entry", async () => {
      const { repo, loader, service } = makeMocks();
      (loader.findVersion as jest.Mock).mockReturnValue(null);
      (repo.findOne as jest.Mock).mockResolvedValue(makeEntity());

      await service.findByFormId({
        formId: "passport-renewal",
        version: "1.0.0",
      });

      expect(repo.findOne).toHaveBeenCalledWith({
        where: { formId: "passport-renewal", version: "1.0.0" },
        order: { createdAt: "DESC" },
      });
      expect(warnSpy).toHaveBeenCalled();
    });

    it("throws NotFoundException when neither loader nor DB has the form", async () => {
      const { repo, loader, service } = makeMocks();
      (loader.findLatest as jest.Mock).mockReturnValue(null);
      (repo.findOne as jest.Mock).mockResolvedValue(null);

      await expect(service.findByFormId({ formId: "ghost" })).rejects.toThrow(
        NotFoundException,
      );
    });

    it("throws NotFoundException for an unknown formId+version pair", async () => {
      const { repo, loader, service } = makeMocks();
      (loader.findVersion as jest.Mock).mockReturnValue(null);
      (repo.findOne as jest.Mock).mockResolvedValue(null);

      await expect(
        service.findByFormId({ formId: "ghost", version: "9.9.9" }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe("findByFormId — processors stripping", () => {
    const HYDRATED_WITH_PROCESSORS = {
      ...MOCK_HYDRATED,
      processors: [{ type: "email", config: { to: "ops@example.com" } }],
    };

    it("strips processors by default (includeProcessors omitted)", async () => {
      const { registry, loader, service } = makeMocks();
      (loader.findLatest as jest.Mock).mockReturnValue(MOCK_RECIPE);
      (registry.hydrateForm as jest.Mock).mockResolvedValue(
        HYDRATED_WITH_PROCESSORS,
      );

      const result = await service.findByFormId({ formId: "f" });

      expect("processors" in result).toBe(false);
    });

    it("strips processors when includeProcessors:false", async () => {
      const { registry, loader, service } = makeMocks();
      (loader.findLatest as jest.Mock).mockReturnValue(MOCK_RECIPE);
      (registry.hydrateForm as jest.Mock).mockResolvedValue(
        HYDRATED_WITH_PROCESSORS,
      );

      const result = await service.findByFormId({
        formId: "f",
        includeProcessors: false,
      });

      expect("processors" in result).toBe(false);
    });

    it("keeps processors when includeProcessors:true", async () => {
      const { registry, loader, service } = makeMocks();
      (loader.findLatest as jest.Mock).mockReturnValue(MOCK_RECIPE);
      (registry.hydrateForm as jest.Mock).mockResolvedValue(
        HYDRATED_WITH_PROCESSORS,
      );

      const result = await service.findByFormId({
        formId: "f",
        includeProcessors: true,
      });

      expect(result.processors).toEqual(HYDRATED_WITH_PROCESSORS.processors);
    });
  });
});
