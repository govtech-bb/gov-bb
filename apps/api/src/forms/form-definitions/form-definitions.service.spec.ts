import { Logger, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { ServiceContractRecipe } from "@govtech-bb/form-types";
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

  // Force "db" mode (NODE_ENV=development) so these tests, which target the
  // DB findAll path, route through the repo.
  const config = {
    get: jest.fn((key: string, def?: string) => {
      if (key === "RECIPE_SOURCE") return "db";
      if (key === "NODE_ENV") return "development";
      return def;
    }),
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

function makeMocks(
  {
    source,
    nodeEnv = "development",
  }: { source?: "db" | "files" | "both"; nodeEnv?: string } = {
    source: "files",
    nodeEnv: "development",
  },
) {
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
    get: jest.fn((key: string, def?: string) => {
      if (key === "RECIPE_SOURCE") return source ?? def;
      if (key === "NODE_ENV") return nodeEnv;
      return def;
    }),
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
  describe("source resolution", () => {
    it("defaults to 'files' when RECIPE_SOURCE is unset", async () => {
      const { fileLoader, service } = makeMocks({
        source: undefined,
        nodeEnv: "development",
      });
      (fileLoader.findByFormId as jest.Mock).mockReturnValue(MOCK_RECIPE);

      await service.findByFormId({ formId: "passport-renewal" });

      expect(fileLoader.findByFormId).toHaveBeenCalled();
    });

    it("honors RECIPE_SOURCE=db when NODE_ENV=development", async () => {
      const { repo, service } = makeMocks({
        source: "db",
        nodeEnv: "development",
      });
      (repo.findOne as jest.Mock).mockResolvedValue(makeEntity());

      await service.findByFormId({ formId: "passport-renewal" });

      expect(repo.findOne).toHaveBeenCalled();
    });

    it("forces RECIPE_SOURCE=db to 'files' (with warning) outside development", async () => {
      const { fileLoader, repo, service } = makeMocks({
        source: "db",
        nodeEnv: "production",
      });
      const warnSpy = jest
        .spyOn(Logger.prototype, "warn")
        .mockImplementation(() => undefined);
      (fileLoader.findByFormId as jest.Mock).mockReturnValue(MOCK_RECIPE);

      await service.findByFormId({ formId: "passport-renewal" });

      expect(fileLoader.findByFormId).toHaveBeenCalled();
      expect(repo.findOne).not.toHaveBeenCalled();
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining("RECIPE_SOURCE=db"),
      );

      warnSpy.mockRestore();
    });

    it("forces RECIPE_SOURCE=db to 'files' when NODE_ENV=test", async () => {
      const { fileLoader, repo, service } = makeMocks({
        source: "db",
        nodeEnv: "test",
      });
      const warnSpy = jest
        .spyOn(Logger.prototype, "warn")
        .mockImplementation(() => undefined);
      (fileLoader.findByFormId as jest.Mock).mockReturnValue(MOCK_RECIPE);

      await service.findByFormId({ formId: "passport-renewal" });

      expect(repo.findOne).not.toHaveBeenCalled();
      expect(fileLoader.findByFormId).toHaveBeenCalled();
      expect(warnSpy).toHaveBeenCalled();

      warnSpy.mockRestore();
    });

    it("honors RECIPE_SOURCE=both when NODE_ENV=development", async () => {
      const { fileLoader, repo, service } = makeMocks({
        source: "both",
        nodeEnv: "development",
      });
      (fileLoader.findAll as jest.Mock).mockReturnValue([]);
      (repo.find as jest.Mock).mockResolvedValue([]);

      await service.findAll();

      expect(fileLoader.findAll).toHaveBeenCalled();
      expect(repo.find).toHaveBeenCalled();
    });

    it("forces RECIPE_SOURCE=both to 'files' (with warning) outside development", async () => {
      const { fileLoader, repo, service } = makeMocks({
        source: "both",
        nodeEnv: "production",
      });
      const warnSpy = jest
        .spyOn(Logger.prototype, "warn")
        .mockImplementation(() => undefined);
      (fileLoader.findAll as jest.Mock).mockReturnValue([]);

      await service.findAll();

      expect(fileLoader.findAll).toHaveBeenCalled();
      expect(repo.find).not.toHaveBeenCalled();
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining("RECIPE_SOURCE=both"),
      );

      warnSpy.mockRestore();
    });
  });

  describe("RECIPE_SOURCE=db (NODE_ENV=development)", () => {
    describe("findByFormId", () => {
      it("returns the latest hydrated form when no version is given", async () => {
        const { repo, registry, service } = makeMocks({
          source: "db",
          nodeEnv: "development",
        });
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
        const { repo, registry, service } = makeMocks({
          source: "db",
          nodeEnv: "development",
        });
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
        const { repo, service } = makeMocks({
          source: "db",
          nodeEnv: "development",
        });
        (repo.findOne as jest.Mock).mockResolvedValue(null);

        await expect(service.findByFormId({ formId: "ghost" })).rejects.toThrow(
          NotFoundException,
        );
      });

      it("throws NotFoundException when formId + version is not found", async () => {
        const { repo, service } = makeMocks({
          source: "db",
          nodeEnv: "development",
        });
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
        const { repo, registry, service } = makeMocks({
          source: "db",
          nodeEnv: "development",
        });
        (repo.findOne as jest.Mock).mockResolvedValue(makeEntity());
        (registry.hydrateForm as jest.Mock).mockResolvedValue(
          HYDRATED_WITH_PROCESSORS,
        );

        const result = await service.findByFormId({ formId: "f" });

        expect("processors" in result).toBe(false);
      });

      it("strips processors when includeProcessors:false", async () => {
        const { repo, registry, service } = makeMocks({
          source: "db",
          nodeEnv: "development",
        });
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
        const { repo, registry, service } = makeMocks({
          source: "db",
          nodeEnv: "development",
        });
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

  describe("RECIPE_SOURCE=both (NODE_ENV=development)", () => {
    describe("findAll", () => {
      it("returns the union when each source has unique formIds", async () => {
        const { fileLoader, repo, service } = makeMocks({
          source: "both",
          nodeEnv: "development",
        });
        (fileLoader.findAll as jest.Mock).mockReturnValue([
          { formId: "file-only", title: "File Only" },
        ]);
        (repo.find as jest.Mock).mockResolvedValue([
          makeEntityWithTitle("db-only", "DB Only"),
        ]);

        const result = await service.findAll();

        expect(result).toEqual(
          expect.arrayContaining([
            { formId: "file-only", title: "File Only" },
            { formId: "db-only", title: "DB Only" },
          ]),
        );
        expect(result).toHaveLength(2);
      });

      it("prefers the DB title on a formId collision", async () => {
        const { fileLoader, repo, service } = makeMocks({
          source: "both",
          nodeEnv: "development",
        });
        (fileLoader.findAll as jest.Mock).mockReturnValue([
          { formId: "passport-renewal", title: "Passport Renewal (file)" },
        ]);
        (repo.find as jest.Mock).mockResolvedValue([
          makeEntityWithTitle("passport-renewal", "Passport Renewal (db)"),
        ]);

        const result = await service.findAll();

        expect(result).toEqual([
          { formId: "passport-renewal", title: "Passport Renewal (db)" },
        ]);
      });
    });

    describe("getRecipe with version supplied", () => {
      it("returns the DB schema when DB has the formId+version (even if files also has it)", async () => {
        const { fileLoader, repo, service } = makeMocks({
          source: "both",
          nodeEnv: "development",
        });
        const dbRecipe = { ...MOCK_RECIPE, title: "DB" };
        const fileRecipe = { ...MOCK_RECIPE, title: "File" };
        (repo.findOne as jest.Mock).mockResolvedValue(
          makeEntity({ schema: dbRecipe as unknown as ServiceContractRecipe }),
        );
        (fileLoader.findByFormId as jest.Mock).mockReturnValue(fileRecipe);

        const result = await service.getRecipe({
          formId: "passport-renewal",
          version: "1.0.0",
        });

        expect(result).toEqual(dbRecipe);
        expect(fileLoader.findByFormId).not.toHaveBeenCalled();
      });

      it("falls through to the file loader when DB has no matching row", async () => {
        const { fileLoader, repo, service } = makeMocks({
          source: "both",
          nodeEnv: "development",
        });
        (repo.findOne as jest.Mock).mockResolvedValue(null);
        (fileLoader.findByFormId as jest.Mock).mockReturnValue(MOCK_RECIPE);

        const result = await service.getRecipe({
          formId: "passport-renewal",
          version: "1.0.0",
        });

        expect(fileLoader.findByFormId).toHaveBeenCalledWith({
          formId: "passport-renewal",
          version: "1.0.0",
        });
        expect(result).toBe(MOCK_RECIPE);
      });
    });

    describe("getRecipe without version", () => {
      it("returns the file recipe when files have the higher semver", async () => {
        const { fileLoader, repo, service } = makeMocks({
          source: "both",
          nodeEnv: "development",
        });
        const dbRecipe = { ...MOCK_RECIPE, version: "1.1.0", title: "DB" };
        const fileRecipe = { ...MOCK_RECIPE, version: "1.2.0", title: "File" };
        (repo.findOne as jest.Mock).mockResolvedValue(
          makeEntity({
            version: "1.1.0",
            schema: dbRecipe as unknown as ServiceContractRecipe,
          }),
        );
        (fileLoader.findByFormId as jest.Mock).mockReturnValue(fileRecipe);

        const result = await service.getRecipe({ formId: "passport-renewal" });

        expect(result).toEqual(fileRecipe);
      });

      it("returns the DB recipe when DB has the higher semver", async () => {
        const { fileLoader, repo, service } = makeMocks({
          source: "both",
          nodeEnv: "development",
        });
        const dbRecipe = { ...MOCK_RECIPE, version: "1.2.0", title: "DB" };
        const fileRecipe = { ...MOCK_RECIPE, version: "1.0.0", title: "File" };
        (repo.findOne as jest.Mock).mockResolvedValue(
          makeEntity({
            version: "1.2.0",
            schema: dbRecipe as unknown as ServiceContractRecipe,
          }),
        );
        (fileLoader.findByFormId as jest.Mock).mockReturnValue(fileRecipe);

        const result = await service.getRecipe({ formId: "passport-renewal" });

        expect(result).toEqual(dbRecipe);
      });

      it("DB wins when DB and file versions tie", async () => {
        const { fileLoader, repo, service } = makeMocks({
          source: "both",
          nodeEnv: "development",
        });
        const dbRecipe = { ...MOCK_RECIPE, version: "1.0.0", title: "DB" };
        const fileRecipe = { ...MOCK_RECIPE, version: "1.0.0", title: "File" };
        (repo.findOne as jest.Mock).mockResolvedValue(
          makeEntity({
            version: "1.0.0",
            schema: dbRecipe as unknown as ServiceContractRecipe,
          }),
        );
        (fileLoader.findByFormId as jest.Mock).mockReturnValue(fileRecipe);

        const result = await service.getRecipe({ formId: "passport-renewal" });

        expect(result).toEqual(dbRecipe);
      });

      it("returns the DB recipe when only DB has it", async () => {
        const { fileLoader, repo, service } = makeMocks({
          source: "both",
          nodeEnv: "development",
        });
        const dbRecipe = { ...MOCK_RECIPE, title: "DB-only" };
        (repo.findOne as jest.Mock).mockResolvedValue(
          makeEntity({ schema: dbRecipe as unknown as ServiceContractRecipe }),
        );
        (fileLoader.findByFormId as jest.Mock).mockReturnValue(null);

        const result = await service.getRecipe({ formId: "db-only" });

        expect(result).toEqual(dbRecipe);
      });

      it("returns the file recipe when only files has it", async () => {
        const { fileLoader, repo, service } = makeMocks({
          source: "both",
          nodeEnv: "development",
        });
        const fileRecipe = { ...MOCK_RECIPE, title: "File-only" };
        (repo.findOne as jest.Mock).mockResolvedValue(null);
        (fileLoader.findByFormId as jest.Mock).mockReturnValue(fileRecipe);

        const result = await service.getRecipe({ formId: "file-only" });

        expect(result).toBe(fileRecipe);
      });

      it("returns null when neither source has a recipe", async () => {
        const { fileLoader, repo, service } = makeMocks({
          source: "both",
          nodeEnv: "development",
        });
        (repo.findOne as jest.Mock).mockResolvedValue(null);
        (fileLoader.findByFormId as jest.Mock).mockReturnValue(null);

        const result = await service.getRecipe({ formId: "ghost" });

        expect(result).toBeNull();
      });
    });
  });

  describe("getRecipe (public)", () => {
    it("is exposed as a public method on the service", () => {
      const { service } = makeMocks({ source: "files" });
      expect(typeof service.getRecipe).toBe("function");
    });

    it("returns the raw recipe from the file loader in files mode", async () => {
      const { fileLoader, registry, service } = makeMocks({ source: "files" });
      (fileLoader.findByFormId as jest.Mock).mockReturnValue(MOCK_RECIPE);

      const result = await service.getRecipe({
        formId: "passport-renewal",
        version: "1.0.0",
      });

      expect(fileLoader.findByFormId).toHaveBeenCalledWith({
        formId: "passport-renewal",
        version: "1.0.0",
      });
      // Raw recipe — no hydration when called via getRecipe directly.
      expect(registry.hydrateForm).not.toHaveBeenCalled();
      expect(result).toBe(MOCK_RECIPE);
    });

    it("returns null when the file loader has no matching recipe", async () => {
      const { fileLoader, service } = makeMocks({ source: "files" });
      (fileLoader.findByFormId as jest.Mock).mockReturnValue(null);

      const result = await service.getRecipe({ formId: "ghost" });

      expect(result).toBeNull();
    });

    it("returns the raw recipe schema from the repo in db mode (dev)", async () => {
      const { repo, registry, service } = makeMocks({
        source: "db",
        nodeEnv: "development",
      });
      (repo.findOne as jest.Mock).mockResolvedValue(makeEntity());

      const result = await service.getRecipe({ formId: "passport-renewal" });

      expect(repo.findOne).toHaveBeenCalledWith({
        where: { formId: "passport-renewal" },
        order: { createdAt: "DESC" },
      });
      expect(registry.hydrateForm).not.toHaveBeenCalled();
      expect(result).toEqual(MOCK_RECIPE);
    });

    it("returns null when no DB row matches in db mode", async () => {
      const { repo, service } = makeMocks({
        source: "db",
        nodeEnv: "development",
      });
      (repo.findOne as jest.Mock).mockResolvedValue(null);

      const result = await service.getRecipe({ formId: "ghost" });

      expect(result).toBeNull();
    });
  });

  describe("preview flag", () => {
    describe("valid preview resolves via DB/both even in prod files mode", () => {
      it("getRecipe with preview:true consults DB (both path) even when source=files/prod", async () => {
        const { repo, fileLoader, service } = makeMocks({
          source: "files",
          nodeEnv: "production",
        });
        const dbRecipe = { ...MOCK_RECIPE, title: "DB" };
        const fileRecipe = { ...MOCK_RECIPE, title: "File" };
        (repo.findOne as jest.Mock).mockResolvedValue(
          makeEntity({ schema: dbRecipe as unknown as ServiceContractRecipe }),
        );
        (fileLoader.findByFormId as jest.Mock).mockReturnValue(fileRecipe);

        await service.getRecipe({ formId: "passport-renewal", preview: true });

        // The both path must have run — DB consulted
        expect(repo.findOne).toHaveBeenCalled();
      });

      it("findByFormId with preview:true consults DB (both path) even when source=files/prod", async () => {
        const { repo, fileLoader, service } = makeMocks({
          source: "files",
          nodeEnv: "production",
        });
        const dbRecipe = { ...MOCK_RECIPE, title: "DB" };
        const fileRecipe = { ...MOCK_RECIPE, title: "File" };
        (repo.findOne as jest.Mock).mockResolvedValue(
          makeEntity({ schema: dbRecipe as unknown as ServiceContractRecipe }),
        );
        (fileLoader.findByFormId as jest.Mock).mockReturnValue(fileRecipe);

        await service.findByFormId({
          formId: "passport-renewal",
          preview: true,
        });

        // DB was consulted — both path ran despite source=files/prod
        expect(repo.findOne).toHaveBeenCalled();
      });
    });

    describe("preview=false or omitted leaves existing source resolution unchanged", () => {
      it("getRecipe with preview:false delegates to fileLoader only (no DB)", async () => {
        const { fileLoader, repo, service } = makeMocks({
          source: "files",
          nodeEnv: "production",
        });
        (fileLoader.findByFormId as jest.Mock).mockReturnValue(MOCK_RECIPE);

        await service.getRecipe({ formId: "passport-renewal", preview: false });

        expect(fileLoader.findByFormId).toHaveBeenCalled();
        expect(repo.findOne).not.toHaveBeenCalled();
      });

      it("getRecipe with preview omitted delegates to fileLoader only (no DB)", async () => {
        const { fileLoader, repo, service } = makeMocks({
          source: "files",
          nodeEnv: "production",
        });
        (fileLoader.findByFormId as jest.Mock).mockReturnValue(MOCK_RECIPE);

        await service.getRecipe({ formId: "passport-renewal" });

        expect(fileLoader.findByFormId).toHaveBeenCalled();
        expect(repo.findOne).not.toHaveBeenCalled();
      });
    });

    describe("preview takes the version-aware both path when version supplied", () => {
      it("DB is tried first and result returned when DB has a match", async () => {
        const { repo, fileLoader, service } = makeMocks({
          source: "files",
          nodeEnv: "production",
        });
        const dbRecipe = { ...MOCK_RECIPE, title: "DB" };
        (repo.findOne as jest.Mock).mockResolvedValue(
          makeEntity({ schema: dbRecipe as unknown as ServiceContractRecipe }),
        );
        (fileLoader.findByFormId as jest.Mock).mockReturnValue(MOCK_RECIPE);

        const result = await service.getRecipe({
          formId: "passport-renewal",
          version: "1.0.0",
          preview: true,
        });

        expect(repo.findOne).toHaveBeenCalledWith(
          expect.objectContaining({
            where: expect.objectContaining({ version: "1.0.0" }),
          }),
        );
        expect(result).toEqual(dbRecipe);
        // DB returned a result, so files should not have been consulted
        expect(fileLoader.findByFormId).not.toHaveBeenCalled();
      });

      it("falls through to files when DB misses on the version", async () => {
        const { repo, fileLoader, service } = makeMocks({
          source: "files",
          nodeEnv: "production",
        });
        (repo.findOne as jest.Mock).mockResolvedValue(null);
        (fileLoader.findByFormId as jest.Mock).mockReturnValue(MOCK_RECIPE);

        const result = await service.getRecipe({
          formId: "passport-renewal",
          version: "1.0.0",
          preview: true,
        });

        expect(repo.findOne).toHaveBeenCalledWith(
          expect.objectContaining({
            where: expect.objectContaining({ version: "1.0.0" }),
          }),
        );
        expect(fileLoader.findByFormId).toHaveBeenCalledWith({
          formId: "passport-renewal",
          version: "1.0.0",
        });
        expect(result).toBe(MOCK_RECIPE);
      });
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
