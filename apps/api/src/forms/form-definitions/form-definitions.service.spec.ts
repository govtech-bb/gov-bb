import { NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { FormDefinitionEntity } from "../../database/entities/form-definition.entity";
import { FormDefinitionRepository } from "./form-definition.repository";
import { RegistryService } from "../../registry/registry.service";
import { RecipeFileLoaderService } from "./recipe-file-loader.service";
import { FormDefinitionsService } from "./form-definitions.service";

// ---------------------------------------------------------------------------
// Helpers shared across describe blocks
// ---------------------------------------------------------------------------

function makeEntityWithTitle(
  formId: string,
  title: string,
  overrides: Partial<FormDefinitionEntity> = {},
): FormDefinitionEntity {
  return {
    id: `uuid-${formId}`,
    formId,
    version: "1.0.0",
    schema: { title } as unknown as Record<string, unknown>,
    publishedAt: null,
    createdAt: new Date("2026-01-01"),
    updatedAt: new Date("2026-01-01"),
    ...overrides,
  } as FormDefinitionEntity;
}

function makeFindAllMocks(entities: FormDefinitionEntity[]) {
  const repo = {
    find: jest.fn().mockResolvedValue(entities),
    findOne: jest.fn(),
  } as unknown as jest.Mocked<FormDefinitionRepository>;

  const registry = {
    hydrateForm: jest.fn().mockResolvedValue({}),
  } as unknown as jest.Mocked<RegistryService>;

  const fileLoader = {
    findAll: jest.fn(),
    findByFormId: jest.fn(),
  } as unknown as jest.Mocked<RecipeFileLoaderService>;

  const config = {
    get: jest.fn((key: string, def?: string) =>
      key === "RECIPE_SOURCE" ? "db" : def,
    ),
  } as unknown as jest.Mocked<ConfigService>;

  const service = new FormDefinitionsService(
    repo,
    registry,
    fileLoader,
    config,
  );
  return { repo, registry, service };
}

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

function makeMocks({ source }: { source: "db" | "files" } = { source: "db" }) {
  const repo = {
    find: jest.fn(),
    findOne: jest.fn(),
  } as unknown as jest.Mocked<FormDefinitionRepository>;

  const registry = {
    hydrateForm: jest.fn().mockResolvedValue(MOCK_HYDRATED),
  } as unknown as jest.Mocked<RegistryService>;

  const fileLoader = {
    findAll: jest.fn(),
    findByFormId: jest.fn(),
  } as unknown as jest.Mocked<RecipeFileLoaderService>;

  const config = {
    get: jest.fn((key: string, def?: string) =>
      key === "RECIPE_SOURCE" ? source : def,
    ),
  } as unknown as jest.Mocked<ConfigService>;

  const service = new FormDefinitionsService(
    repo,
    registry,
    fileLoader,
    config,
  );
  return { repo, registry, fileLoader, config, service };
}

describe("FormDefinitionsService", () => {
  describe("RECIPE_SOURCE=db (default)", () => {
    describe("findByFormId", () => {
      it("returns the latest hydrated form when no version is given", async () => {
        const { repo, registry, service } = makeMocks({ source: "db" });
        (repo.findOne as jest.Mock).mockResolvedValue(makeEntity());

        const result = await service.findByFormId({
          formId: "passport-renewal",
        });

        expect(repo.findOne).toHaveBeenCalledWith({
          where: { formId: "passport-renewal" },
          order: { createdAt: "DESC" },
        });
        expect(registry.hydrateForm).toHaveBeenCalledWith(MOCK_RECIPE);
        expect(result).toEqual(MOCK_HYDRATED_STRIPPED);
      });

      it("returns a specific version when version is given", async () => {
        const { repo, registry, service } = makeMocks({ source: "db" });
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
        expect(result).toEqual(MOCK_HYDRATED_STRIPPED);
      });

      it("throws NotFoundException when formId is not found", async () => {
        const { repo, service } = makeMocks({ source: "db" });
        (repo.findOne as jest.Mock).mockResolvedValue(null);

        await expect(service.findByFormId({ formId: "ghost" })).rejects.toThrow(
          NotFoundException,
        );
      });

      it("throws NotFoundException when formId + version is not found", async () => {
        const { repo, service } = makeMocks({ source: "db" });
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
        const { repo, registry, service } = makeMocks({ source: "db" });
        (repo.findOne as jest.Mock).mockResolvedValue(makeEntity());
        (registry.hydrateForm as jest.Mock).mockResolvedValue(
          HYDRATED_WITH_PROCESSORS,
        );

        const result = await service.findByFormId({ formId: "f" });

        expect("processors" in result).toBe(false);
      });

      it("strips processors when includeProcessors:false", async () => {
        const { repo, registry, service } = makeMocks({ source: "db" });
        (repo.findOne as jest.Mock).mockResolvedValue(makeEntity());
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
        const { repo, registry, service } = makeMocks({ source: "db" });
        (repo.findOne as jest.Mock).mockResolvedValue(makeEntity());
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

  describe("RECIPE_SOURCE=files", () => {
    it("findByFormId delegates to the file loader (latest)", async () => {
      const { fileLoader, registry, repo, service } = makeMocks({
        source: "files",
      });
      (fileLoader.findByFormId as jest.Mock).mockReturnValue(MOCK_RECIPE);

      const result = await service.findByFormId({ formId: "passport-renewal" });

      expect(fileLoader.findByFormId).toHaveBeenCalledWith({
        formId: "passport-renewal",
        version: undefined,
      });
      expect(repo.findOne).not.toHaveBeenCalled();
      expect(registry.hydrateForm).toHaveBeenCalledWith(MOCK_RECIPE);
      expect(result).toEqual(MOCK_HYDRATED_STRIPPED);
    });

    it("findByFormId delegates to the file loader with a specific version", async () => {
      const { fileLoader, service } = makeMocks({ source: "files" });
      (fileLoader.findByFormId as jest.Mock).mockReturnValue(MOCK_RECIPE);

      await service.findByFormId({
        formId: "passport-renewal",
        version: "1.0.0",
      });

      expect(fileLoader.findByFormId).toHaveBeenCalledWith({
        formId: "passport-renewal",
        version: "1.0.0",
      });
    });

    it("throws NotFoundException when the file loader returns null", async () => {
      const { fileLoader, service } = makeMocks({ source: "files" });
      (fileLoader.findByFormId as jest.Mock).mockReturnValue(null);

      await expect(service.findByFormId({ formId: "ghost" })).rejects.toThrow(
        NotFoundException,
      );
    });

    it("findAll delegates to the file loader", async () => {
      const { fileLoader, service } = makeMocks({ source: "files" });
      (fileLoader.findAll as jest.Mock).mockReturnValue([
        { formId: "passport-renewal", title: "Passport Renewal" },
      ]);

      const result = await service.findAll();

      expect(fileLoader.findAll).toHaveBeenCalled();
      expect(result).toEqual([
        { formId: "passport-renewal", title: "Passport Renewal" },
      ]);
    });
  });
});

// ---------------------------------------------------------------------------
// findAll — completely separate describe (no coverage at all before this)
// ---------------------------------------------------------------------------

describe("FormDefinitionsService.findAll", () => {
  it("returns an empty array when no form definitions exist", async () => {
    const { service } = makeFindAllMocks([]);
    const result = await service.findAll();
    expect(result).toEqual([]);
  });

  it("calls repo.find ordered by createdAt DESC", async () => {
    const { repo, service } = makeFindAllMocks([]);
    await service.findAll();
    expect(repo.find).toHaveBeenCalledWith({ order: { createdAt: "DESC" } });
  });

  it("returns one entry per unique formId with title from schema", async () => {
    const entities = [
      makeEntityWithTitle("passport-renewal", "Passport Renewal"),
      makeEntityWithTitle("birth-cert", "Birth Certificate"),
    ];
    const { service } = makeFindAllMocks(entities);

    const result = await service.findAll();

    expect(result).toEqual([
      { formId: "passport-renewal", title: "Passport Renewal" },
      { formId: "birth-cert", title: "Birth Certificate" },
    ]);
  });

  it("de-duplicates formIds — keeps only the first (latest by createdAt DESC) version", async () => {
    // repo returns multiple rows for the same formId (different versions)
    const entities = [
      makeEntityWithTitle("passport-renewal", "Passport Renewal v2", {
        version: "2.0.0",
        createdAt: new Date("2026-06-01"),
      }),
      makeEntityWithTitle("passport-renewal", "Passport Renewal v1", {
        version: "1.0.0",
        createdAt: new Date("2026-01-01"),
      }),
    ];
    const { service } = makeFindAllMocks(entities);

    const result = await service.findAll();

    // Only the first encountered entry is kept
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      formId: "passport-renewal",
      title: "Passport Renewal v2",
    });
  });

  it("preserves insertion order of unique formIds", async () => {
    const entities = [
      makeEntityWithTitle("form-a", "Form A"),
      makeEntityWithTitle("form-b", "Form B"),
      makeEntityWithTitle("form-c", "Form C"),
    ];
    const { service } = makeFindAllMocks(entities);

    const result = await service.findAll();

    expect(result.map((r) => r.formId)).toEqual(["form-a", "form-b", "form-c"]);
  });

  it("handles a mix of duplicates and unique formIds correctly", async () => {
    const entities = [
      makeEntityWithTitle("form-a", "Form A v2"),
      makeEntityWithTitle("form-b", "Form B"),
      makeEntityWithTitle("form-a", "Form A v1"),
      makeEntityWithTitle("form-c", "Form C"),
    ];
    const { service } = makeFindAllMocks(entities);

    const result = await service.findAll();

    expect(result).toEqual([
      { formId: "form-a", title: "Form A v2" },
      { formId: "form-b", title: "Form B" },
      { formId: "form-c", title: "Form C" },
    ]);
  });
});
