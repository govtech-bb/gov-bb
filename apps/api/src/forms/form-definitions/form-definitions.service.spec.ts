import type { Mock, Mocked } from "vitest";
import { Logger, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { ServiceContractRecipe } from "@govtech-bb/form-types";
import type { FormDefinitionEntity } from "@/database/entities/form-definition.entity";
import { FormDefinitionRepository } from "./form-definition.repository";
import { RegistryService } from "@/registry/registry.service";
import { RecipeFileLoaderService } from "./recipe-file-loader.service";
import { FormConfigService } from "../form-config/form-config.service";
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
    find: vi.fn().mockResolvedValue(entities),
    findOne: vi.fn(),
  } as unknown as Mocked<FormDefinitionRepository>;

  const registry = {
    hydrateForm: vi.fn().mockResolvedValue({}),
  } as unknown as Mocked<RegistryService>;

  const fileLoader = {
    findAll: vi.fn(),
    findByFormId: vi.fn(),
  } as unknown as Mocked<RecipeFileLoaderService>;

  // Force "db" mode (NODE_ENV=development) so these tests, which target the
  // DB findAll path, route through the repo.
  const config = {
    get: vi.fn((key: string, def?: string) => {
      if (key === "RECIPE_SOURCE") return "db";
      if (key === "NODE_ENV") return "development";
      return def;
    }),
  } as unknown as Mocked<ConfigService>;

  const formConfig = {
    resolveProcessors: vi.fn().mockResolvedValue([]),
  } as unknown as Mocked<FormConfigService>;

  const service = new FormDefinitionsService(
    repo,
    registry,
    fileLoader,
    config,
    formConfig,
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

const { processors: _processors, ...MOCK_HYDRATED_STRIPPED_BASE } =
  MOCK_HYDRATED;

// All client-path responses now carry `requiresPayment` (computed from the
// merged recipe + DB processors). The fixture mock has no payment processor in
// either source, so the expected stripped shape is the base + `false`.
const MOCK_HYDRATED_STRIPPED = {
  ...MOCK_HYDRATED_STRIPPED_BASE,
  requiresPayment: false,
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
    find: vi.fn(),
    findOne: vi.fn(),
  } as unknown as Mocked<FormDefinitionRepository>;

  const registry = {
    hydrateForm: vi.fn().mockResolvedValue(MOCK_HYDRATED),
  } as unknown as Mocked<RegistryService>;

  const fileLoader = {
    findAll: vi.fn(),
    findByFormId: vi.fn(),
  } as unknown as Mocked<RecipeFileLoaderService>;

  const config = {
    get: vi.fn((key: string, def?: string) => {
      if (key === "RECIPE_SOURCE") return source ?? def;
      if (key === "NODE_ENV") return nodeEnv;
      return def;
    }),
  } as unknown as Mocked<ConfigService>;

  const formConfig = {
    resolveProcessors: vi.fn().mockResolvedValue([]),
  } as unknown as Mocked<FormConfigService>;

  const service = new FormDefinitionsService(
    repo,
    registry,
    fileLoader,
    config,
    formConfig,
  );
  return { repo, registry, fileLoader, config, formConfig, service };
}

describe("FormDefinitionsService", () => {
  describe("source resolution", () => {
    it("defaults to 'files' when RECIPE_SOURCE is unset", async () => {
      const { fileLoader, service } = makeMocks({
        source: undefined,
        nodeEnv: "development",
      });
      (fileLoader.findByFormId as Mock).mockReturnValue(MOCK_RECIPE);

      await service.findByFormId({ formId: "passport-renewal" });

      expect(fileLoader.findByFormId).toHaveBeenCalled();
    });

    it("honors RECIPE_SOURCE=db when NODE_ENV=development", async () => {
      const { repo, service } = makeMocks({
        source: "db",
        nodeEnv: "development",
      });
      (repo.findOne as Mock).mockResolvedValue(makeEntity());

      await service.findByFormId({ formId: "passport-renewal" });

      expect(repo.findOne).toHaveBeenCalled();
    });

    it("forces RECIPE_SOURCE=db to 'files' (with warning) outside development", async () => {
      const { fileLoader, repo, service } = makeMocks({
        source: "db",
        nodeEnv: "production",
      });
      const warnSpy = vi
        .spyOn(Logger.prototype, "warn")
        .mockImplementation(() => undefined);
      (fileLoader.findByFormId as Mock).mockReturnValue(MOCK_RECIPE);

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
      const warnSpy = vi
        .spyOn(Logger.prototype, "warn")
        .mockImplementation(() => undefined);
      (fileLoader.findByFormId as Mock).mockReturnValue(MOCK_RECIPE);

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
      (fileLoader.findAll as Mock).mockReturnValue([]);
      (repo.find as Mock).mockResolvedValue([]);

      await service.findAll();

      expect(fileLoader.findAll).toHaveBeenCalled();
      expect(repo.find).toHaveBeenCalled();
    });

    it("forces RECIPE_SOURCE=both to 'files' (with warning) outside development", async () => {
      const { fileLoader, repo, service } = makeMocks({
        source: "both",
        nodeEnv: "production",
      });
      const warnSpy = vi
        .spyOn(Logger.prototype, "warn")
        .mockImplementation(() => undefined);
      (fileLoader.findAll as Mock).mockReturnValue([]);

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
        (repo.findOne as Mock).mockResolvedValue(makeEntity());

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
        (repo.findOne as Mock).mockResolvedValue(makeEntity());

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
        (repo.findOne as Mock).mockResolvedValue(null);

        await expect(service.findByFormId({ formId: "ghost" })).rejects.toThrow(
          NotFoundException,
        );
      });

      it("throws NotFoundException when formId + version is not found", async () => {
        const { repo, service } = makeMocks({
          source: "db",
          nodeEnv: "development",
        });
        (repo.findOne as Mock).mockResolvedValue(null);

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
        (repo.findOne as Mock).mockResolvedValue(makeEntity());
        (registry.hydrateForm as Mock).mockResolvedValue(
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
        (repo.findOne as Mock).mockResolvedValue(makeEntity());
        (registry.hydrateForm as Mock).mockResolvedValue(
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
        (repo.findOne as Mock).mockResolvedValue(makeEntity());
        (registry.hydrateForm as Mock).mockResolvedValue(
          HYDRATED_WITH_PROCESSORS,
        );

        const result = await service.findByFormId({
          formId: "f",
          includeProcessors: true,
        });

        expect(result.processors).toEqual(HYDRATED_WITH_PROCESSORS.processors);
      });
    });

    // #965: payment forms (birth/death/marriage cert) were collected inline
    // by the chat because `processors` is stripped on the public contract, so
    // the chat's `needsPayment` check was always false. We now expose a safe
    // boolean `requiresPayment` derived server-side from the merged recipe +
    // form_config processors.
    describe("findByFormId — requiresPayment flag (#965)", () => {
      const PAYMENT = {
        type: "payment",
        config: { paymentCode: "X", amount: 5 },
      };
      const EMAIL = { type: "email", config: { to: "x@example.com" } };

      function hydratedWith(processors: unknown[]) {
        return { ...MOCK_HYDRATED, processors };
      }

      it("is true when the recipe has a payment processor", async () => {
        const { repo, registry, service } = makeMocks({
          source: "db",
          nodeEnv: "development",
        });
        (repo.findOne as Mock).mockResolvedValue(makeEntity());
        (registry.hydrateForm as Mock).mockResolvedValue(
          hydratedWith([PAYMENT]),
        );

        const result = await service.findByFormId({ formId: "f" });

        expect(result.requiresPayment).toBe(true);
        expect("processors" in result).toBe(false);
      });

      it("is true when only the DB form_config adds a payment processor", async () => {
        const { repo, registry, formConfig, service } = makeMocks({
          source: "db",
          nodeEnv: "development",
        });
        (repo.findOne as Mock).mockResolvedValue(makeEntity());
        (registry.hydrateForm as Mock).mockResolvedValue(hydratedWith([EMAIL]));
        (formConfig.resolveProcessors as Mock).mockResolvedValue([PAYMENT]);

        const result = await service.findByFormId({ formId: "f" });

        expect(result.requiresPayment).toBe(true);
      });

      it("is false when no payment processor is present in either source", async () => {
        const { repo, registry, service } = makeMocks({
          source: "db",
          nodeEnv: "development",
        });
        (repo.findOne as Mock).mockResolvedValue(makeEntity());
        (registry.hydrateForm as Mock).mockResolvedValue(hydratedWith([EMAIL]));

        const result = await service.findByFormId({ formId: "f" });

        expect(result.requiresPayment).toBe(false);
      });

      it("is also set when includeProcessors:true so both consumers see it", async () => {
        const { repo, registry, service } = makeMocks({
          source: "db",
          nodeEnv: "development",
        });
        (repo.findOne as Mock).mockResolvedValue(makeEntity());
        (registry.hydrateForm as Mock).mockResolvedValue(
          hydratedWith([PAYMENT]),
        );

        const result = await service.findByFormId({
          formId: "f",
          includeProcessors: true,
        });

        expect(result.requiresPayment).toBe(true);
        expect(result.processors).toEqual([PAYMENT]);
      });
    });

    describe("findByFormId — DB processors from form_config (#716)", () => {
      const RECIPE_EMAIL = { type: "email", config: { to: "ops@example.com" } };
      const RECIPE_PAYMENT = {
        type: "payment",
        config: { paymentCode: "RECIPE", amount: 10 },
      };
      const DB_PAYMENT = {
        type: "payment",
        config: { paymentCode: "DB", amount: 25 },
      };

      function hydratedWith(processors: unknown[]) {
        return { ...MOCK_HYDRATED, processors };
      }

      it("appends DB processors after the recipe processors when includeProcessors:true", async () => {
        const { repo, registry, formConfig, service } = makeMocks({
          source: "db",
          nodeEnv: "development",
        });
        (repo.findOne as Mock).mockResolvedValue(makeEntity());
        (registry.hydrateForm as Mock).mockResolvedValue(
          hydratedWith([RECIPE_EMAIL]),
        );
        (formConfig.resolveProcessors as Mock).mockResolvedValue([DB_PAYMENT]);

        const result = await service.findByFormId({
          formId: "passport-renewal",
          includeProcessors: true,
        });

        expect(formConfig.resolveProcessors).toHaveBeenCalledWith(
          "passport-renewal",
        );
        expect(result.processors).toEqual([RECIPE_EMAIL, DB_PAYMENT]);
      });

      it("drops recipe payment processors when the DB set has a payment (DB wins)", async () => {
        const { repo, registry, formConfig, service } = makeMocks({
          source: "db",
          nodeEnv: "development",
        });
        (repo.findOne as Mock).mockResolvedValue(makeEntity());
        (registry.hydrateForm as Mock).mockResolvedValue(
          hydratedWith([RECIPE_EMAIL, RECIPE_PAYMENT]),
        );
        (formConfig.resolveProcessors as Mock).mockResolvedValue([DB_PAYMENT]);

        const result = await service.findByFormId({
          formId: "passport-renewal",
          includeProcessors: true,
        });

        // The recipe payment is gone; the non-payment recipe entry stays.
        expect(result.processors).toEqual([RECIPE_EMAIL, DB_PAYMENT]);
      });

      it("leaves the recipe untouched when the DB set is empty", async () => {
        const { repo, registry, formConfig, service } = makeMocks({
          source: "db",
          nodeEnv: "development",
        });
        (repo.findOne as Mock).mockResolvedValue(makeEntity());
        (registry.hydrateForm as Mock).mockResolvedValue(
          hydratedWith([RECIPE_EMAIL, RECIPE_PAYMENT]),
        );
        (formConfig.resolveProcessors as Mock).mockResolvedValue([]);

        const result = await service.findByFormId({
          formId: "passport-renewal",
          includeProcessors: true,
        });

        expect(result.processors).toEqual([RECIPE_EMAIL, RECIPE_PAYMENT]);
      });

      it("does not drop recipe payments when the DB set has only non-payment processors", async () => {
        const { repo, registry, formConfig, service } = makeMocks({
          source: "db",
          nodeEnv: "development",
        });
        (repo.findOne as Mock).mockResolvedValue(makeEntity());
        (registry.hydrateForm as Mock).mockResolvedValue(
          hydratedWith([RECIPE_PAYMENT]),
        );
        const dbEmail = { type: "email", config: { to: "db@example.com" } };
        (formConfig.resolveProcessors as Mock).mockResolvedValue([dbEmail]);

        const result = await service.findByFormId({
          formId: "passport-renewal",
          includeProcessors: true,
        });

        expect(result.processors).toEqual([RECIPE_PAYMENT, dbEmail]);
      });

      it("propagates when resolveProcessors throws on an invalid blob", async () => {
        const { repo, registry, formConfig, service } = makeMocks({
          source: "db",
          nodeEnv: "development",
        });
        (repo.findOne as Mock).mockResolvedValue(makeEntity());
        (registry.hydrateForm as Mock).mockResolvedValue(
          hydratedWith([RECIPE_EMAIL]),
        );
        (formConfig.resolveProcessors as Mock).mockRejectedValue(
          new Error("invalid blob"),
        );

        await expect(
          service.findByFormId({
            formId: "passport-renewal",
            includeProcessors: true,
          }),
        ).rejects.toThrow("invalid blob");
      });

      it("calls resolveProcessors on the client path so requiresPayment can include DB-only payment processors (#965)", async () => {
        const { repo, registry, formConfig, service } = makeMocks({
          source: "db",
          nodeEnv: "development",
        });
        (repo.findOne as Mock).mockResolvedValue(makeEntity());
        (registry.hydrateForm as Mock).mockResolvedValue(
          hydratedWith([RECIPE_EMAIL]),
        );

        await service.findByFormId({
          formId: "passport-renewal",
          includeProcessors: false,
        });

        expect(formConfig.resolveProcessors).toHaveBeenCalledWith(
          "passport-renewal",
        );
      });
    });
  });

  describe("RECIPE_SOURCE=files", () => {
    it("findByFormId delegates to the file loader (latest)", async () => {
      const { fileLoader, registry, repo, service } = makeMocks({
        source: "files",
      });
      (fileLoader.findByFormId as Mock).mockReturnValue(MOCK_RECIPE);

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
      (fileLoader.findByFormId as Mock).mockReturnValue(MOCK_RECIPE);

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
      (fileLoader.findByFormId as Mock).mockReturnValue(null);

      await expect(service.findByFormId({ formId: "ghost" })).rejects.toThrow(
        NotFoundException,
      );
    });

    it("findAll delegates to the file loader (passes version through)", async () => {
      const { fileLoader, service } = makeMocks({ source: "files" });
      (fileLoader.findAll as Mock).mockReturnValue([
        {
          formId: "passport-renewal",
          title: "Passport Renewal",
          version: "1.0.0",
        },
      ]);

      const result = await service.findAll();

      expect(fileLoader.findAll).toHaveBeenCalled();
      expect(result).toEqual([
        {
          formId: "passport-renewal",
          title: "Passport Renewal",
          version: "1.0.0",
        },
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
        (fileLoader.findAll as Mock).mockReturnValue([
          { formId: "file-only", title: "File Only", version: "1.0.0" },
        ]);
        (repo.find as Mock).mockResolvedValue([
          makeEntityWithTitle("db-only", "DB Only", { version: "2.0.0" }),
        ]);

        const result = await service.findAll();

        expect(result).toEqual(
          expect.arrayContaining([
            { formId: "file-only", title: "File Only", version: "1.0.0" },
            { formId: "db-only", title: "DB Only", version: "2.0.0" },
          ]),
        );
        expect(result).toHaveLength(2);
      });

      it("prefers the DB title on a formId collision", async () => {
        const { fileLoader, repo, service } = makeMocks({
          source: "both",
          nodeEnv: "development",
        });
        (fileLoader.findAll as Mock).mockReturnValue([
          {
            formId: "passport-renewal",
            title: "Passport Renewal (file)",
            version: "1.0.0",
          },
        ]);
        (repo.find as Mock).mockResolvedValue([
          makeEntityWithTitle("passport-renewal", "Passport Renewal (db)", {
            version: "1.1.0",
          }),
        ]);

        const result = await service.findAll();

        expect(result).toEqual([
          {
            formId: "passport-renewal",
            title: "Passport Renewal (db)",
            version: "1.1.0",
          },
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
        (repo.findOne as Mock).mockResolvedValue(
          makeEntity({ schema: dbRecipe as unknown as ServiceContractRecipe }),
        );
        (fileLoader.findByFormId as Mock).mockReturnValue(fileRecipe);

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
        (repo.findOne as Mock).mockResolvedValue(null);
        (fileLoader.findByFormId as Mock).mockReturnValue(MOCK_RECIPE);

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
        (repo.findOne as Mock).mockResolvedValue(
          makeEntity({
            version: "1.1.0",
            schema: dbRecipe as unknown as ServiceContractRecipe,
          }),
        );
        (fileLoader.findByFormId as Mock).mockReturnValue(fileRecipe);

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
        (repo.findOne as Mock).mockResolvedValue(
          makeEntity({
            version: "1.2.0",
            schema: dbRecipe as unknown as ServiceContractRecipe,
          }),
        );
        (fileLoader.findByFormId as Mock).mockReturnValue(fileRecipe);

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
        (repo.findOne as Mock).mockResolvedValue(
          makeEntity({
            version: "1.0.0",
            schema: dbRecipe as unknown as ServiceContractRecipe,
          }),
        );
        (fileLoader.findByFormId as Mock).mockReturnValue(fileRecipe);

        const result = await service.getRecipe({ formId: "passport-renewal" });

        expect(result).toEqual(dbRecipe);
      });

      it("returns the DB recipe when only DB has it", async () => {
        const { fileLoader, repo, service } = makeMocks({
          source: "both",
          nodeEnv: "development",
        });
        const dbRecipe = { ...MOCK_RECIPE, title: "DB-only" };
        (repo.findOne as Mock).mockResolvedValue(
          makeEntity({ schema: dbRecipe as unknown as ServiceContractRecipe }),
        );
        (fileLoader.findByFormId as Mock).mockReturnValue(null);

        const result = await service.getRecipe({ formId: "db-only" });

        expect(result).toEqual(dbRecipe);
      });

      it("returns the file recipe when only files has it", async () => {
        const { fileLoader, repo, service } = makeMocks({
          source: "both",
          nodeEnv: "development",
        });
        const fileRecipe = { ...MOCK_RECIPE, title: "File-only" };
        (repo.findOne as Mock).mockResolvedValue(null);
        (fileLoader.findByFormId as Mock).mockReturnValue(fileRecipe);

        const result = await service.getRecipe({ formId: "file-only" });

        expect(result).toBe(fileRecipe);
      });

      it("returns null when neither source has a recipe", async () => {
        const { fileLoader, repo, service } = makeMocks({
          source: "both",
          nodeEnv: "development",
        });
        (repo.findOne as Mock).mockResolvedValue(null);
        (fileLoader.findByFormId as Mock).mockReturnValue(null);

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
      (fileLoader.findByFormId as Mock).mockReturnValue(MOCK_RECIPE);

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
      (fileLoader.findByFormId as Mock).mockReturnValue(null);

      const result = await service.getRecipe({ formId: "ghost" });

      expect(result).toBeNull();
    });

    it("returns the raw recipe schema from the repo in db mode (dev)", async () => {
      const { repo, registry, service } = makeMocks({
        source: "db",
        nodeEnv: "development",
      });
      (repo.findOne as Mock).mockResolvedValue(makeEntity());

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
      (repo.findOne as Mock).mockResolvedValue(null);

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
        const dbRecipe = makeEntity({
          schema: {
            ...MOCK_RECIPE,
            title: "DB",
          } as unknown as ServiceContractRecipe,
        });
        const fileRecipe = { ...MOCK_RECIPE, title: "File" };
        (repo.findOne as Mock).mockResolvedValue(dbRecipe);
        (fileLoader.findByFormId as Mock).mockReturnValue(fileRecipe);

        const result = await service.getRecipe({
          formId: "passport-renewal",
          preview: true,
        });

        // The both path must have run — DB consulted
        expect(repo.findOne).toHaveBeenCalled();
        // Result must be the DB recipe, not the file recipe
        expect(result).toMatchObject({ title: "DB" });
      });

      it("findByFormId with preview:true consults DB (both path) even when source=files/prod", async () => {
        const { repo, fileLoader, registry, service } = makeMocks({
          source: "files",
          nodeEnv: "production",
        });
        const dbRecipe = makeEntity({
          schema: {
            ...MOCK_RECIPE,
            title: "DB",
          } as unknown as ServiceContractRecipe,
        });
        const fileRecipe = { ...MOCK_RECIPE, title: "File" };
        (repo.findOne as Mock).mockResolvedValue(dbRecipe);
        (fileLoader.findByFormId as Mock).mockReturnValue(fileRecipe);

        await service.findByFormId({
          formId: "passport-renewal",
          preview: true,
        });

        // DB was consulted — both path ran despite source=files/prod
        expect(repo.findOne).toHaveBeenCalled();
        // The DB recipe (not the file recipe) was passed to hydrateForm
        expect(registry.hydrateForm).toHaveBeenCalledWith(
          expect.objectContaining({ title: "DB" }),
        );
      });
    });

    describe("preview=false or omitted leaves existing source resolution unchanged", () => {
      it("getRecipe with preview:false delegates to fileLoader only (no DB)", async () => {
        const { fileLoader, repo, service } = makeMocks({
          source: "files",
          nodeEnv: "production",
        });
        (fileLoader.findByFormId as Mock).mockReturnValue(MOCK_RECIPE);

        await service.getRecipe({ formId: "passport-renewal", preview: false });

        expect(fileLoader.findByFormId).toHaveBeenCalled();
        expect(repo.findOne).not.toHaveBeenCalled();
      });

      it("getRecipe with preview omitted delegates to fileLoader only (no DB)", async () => {
        const { fileLoader, repo, service } = makeMocks({
          source: "files",
          nodeEnv: "production",
        });
        (fileLoader.findByFormId as Mock).mockReturnValue(MOCK_RECIPE);

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
        (repo.findOne as Mock).mockResolvedValue(
          makeEntity({ schema: dbRecipe as unknown as ServiceContractRecipe }),
        );
        (fileLoader.findByFormId as Mock).mockReturnValue(MOCK_RECIPE);

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
        (repo.findOne as Mock).mockResolvedValue(null);
        (fileLoader.findByFormId as Mock).mockReturnValue(MOCK_RECIPE);

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

    describe("preview no-version path uses semver comparison (source=files, prod)", () => {
      it("DB wins when DB and file versions tie (1.0.0 vs 1.0.0)", async () => {
        const { repo, fileLoader, service } = makeMocks({
          source: "files",
          nodeEnv: "production",
        });
        const dbRecipe = { ...MOCK_RECIPE, version: "1.0.0", title: "DB" };
        const fileRecipe = { ...MOCK_RECIPE, version: "1.0.0", title: "File" };
        (repo.findOne as Mock).mockResolvedValue(
          makeEntity({
            version: "1.0.0",
            schema: dbRecipe as unknown as ServiceContractRecipe,
          }),
        );
        (fileLoader.findByFormId as Mock).mockReturnValue(fileRecipe);

        const result = await service.getRecipe({
          formId: "passport-renewal",
          preview: true,
        });

        expect(result).toMatchObject({ title: "DB" });
      });

      it("file wins when file semver is higher than DB (1.0.0 vs 1.1.0)", async () => {
        const { repo, fileLoader, service } = makeMocks({
          source: "files",
          nodeEnv: "production",
        });
        const dbRecipe = { ...MOCK_RECIPE, version: "1.0.0", title: "DB" };
        const fileRecipe = { ...MOCK_RECIPE, version: "1.1.0", title: "File" };
        (repo.findOne as Mock).mockResolvedValue(
          makeEntity({
            version: "1.0.0",
            schema: dbRecipe as unknown as ServiceContractRecipe,
          }),
        );
        (fileLoader.findByFormId as Mock).mockReturnValue(fileRecipe);

        const result = await service.getRecipe({
          formId: "passport-renewal",
          preview: true,
        });

        expect(result).toMatchObject({ title: "File" });
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

  it("returns one entry per unique formId with title and version from schema", async () => {
    const entities = [
      makeEntityWithTitle("passport-renewal", "Passport Renewal"),
      makeEntityWithTitle("birth-cert", "Birth Certificate"),
    ];
    const { service } = makeFindAllMocks(entities);

    const result = await service.findAll();

    expect(result).toEqual([
      {
        formId: "passport-renewal",
        title: "Passport Renewal",
        version: "1.0.0",
      },
      { formId: "birth-cert", title: "Birth Certificate", version: "1.0.0" },
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
      version: "2.0.0",
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
      { formId: "form-a", title: "Form A v2", version: "1.0.0" },
      { formId: "form-b", title: "Form B", version: "1.0.0" },
      { formId: "form-c", title: "Form C", version: "1.0.0" },
    ]);
  });

  it("surfaces contactDetails.title as the category", async () => {
    const entities = [
      makeEntityWithTitle("passport-renewal", "Passport Renewal", {
        schema: {
          title: "Passport Renewal",
          contactDetails: { title: "Immigration Department" },
        } as unknown as ServiceContractRecipe,
      }),
    ];
    const { service } = makeFindAllMocks(entities);

    const result = await service.findAll();

    expect(result).toEqual([
      {
        formId: "passport-renewal",
        title: "Passport Renewal",
        version: "1.0.0",
        category: "Immigration Department",
      },
    ]);
  });

  it("omits category when the schema has no contactDetails", async () => {
    const { service } = makeFindAllMocks([
      makeEntityWithTitle("passport-renewal", "Passport Renewal"),
    ]);

    const result = await service.findAll();

    expect(result[0]).not.toHaveProperty("category");
  });
});
