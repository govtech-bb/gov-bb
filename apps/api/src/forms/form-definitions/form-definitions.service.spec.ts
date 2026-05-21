import { NotFoundException } from "@nestjs/common";
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
  describe("findByFormId", () => {
    it("returns the latest hydrated form from the file loader", async () => {
      const { repo, registry, loader, service } = makeMocks();
      (loader.findLatest as jest.Mock).mockReturnValue(MOCK_RECIPE);

      const result = await service.findByFormId({ formId: "passport-renewal" });

      expect(loader.findLatest).toHaveBeenCalledWith("passport-renewal");
      expect(repo.findOne).not.toHaveBeenCalled();
      expect(registry.hydrateForm).toHaveBeenCalledWith(MOCK_RECIPE);
      expect(result).toEqual(MOCK_HYDRATED_STRIPPED);
    });

    it("returns a specific version from the file loader", async () => {
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

    it("throws NotFoundException when the loader has no entry — no DB fallback", async () => {
      const { repo, loader, service } = makeMocks();
      (loader.findLatest as jest.Mock).mockReturnValue(null);

      await expect(service.findByFormId({ formId: "ghost" })).rejects.toThrow(
        NotFoundException,
      );
      expect(repo.findOne).not.toHaveBeenCalled();
    });

    it("throws NotFoundException for an unknown formId+version pair", async () => {
      const { repo, loader, service } = makeMocks();
      (loader.findVersion as jest.Mock).mockReturnValue(null);

      await expect(
        service.findByFormId({ formId: "ghost", version: "9.9.9" }),
      ).rejects.toThrow(NotFoundException);
      expect(repo.findOne).not.toHaveBeenCalled();
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
