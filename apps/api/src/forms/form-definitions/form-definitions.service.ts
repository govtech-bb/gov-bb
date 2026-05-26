import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { FormDefinitionRepository } from "./form-definition.repository";
import { RecipeFileLoaderService } from "./recipe-file-loader.service";
import { RegistryService } from "../../registry/registry.service";
import { AppError } from "../../common/errors";
import type {
  ServiceContract,
  ServiceContractRecipe,
} from "@govtech-bb/form-types";

type RecipeSource = "db" | "files";

@Injectable()
export class FormDefinitionsService {
  private readonly logger = new Logger(FormDefinitionsService.name);

  constructor(
    private readonly formDefRepo: FormDefinitionRepository,
    private readonly registryService: RegistryService,
    private readonly recipeFileLoader: RecipeFileLoaderService,
    private readonly configService: ConfigService,
  ) {}

  private source(): RecipeSource {
    const raw = this.configService.get<string>("RECIPE_SOURCE", "files");
    if (raw === "db") {
      // Honour `db` only as a dev iteration escape hatch. Outside of
      // development (e.g. NODE_ENV=production, =test), force `files` so
      // unpublished `form_definitions` rows can't leak to end users.
      // See issue #145.
      const nodeEnv = this.configService.get<string>("NODE_ENV");
      if (nodeEnv !== "development") {
        this.logger.warn(
          `RECIPE_SOURCE=db is only honored when NODE_ENV=development (got NODE_ENV=${nodeEnv ?? "undefined"}); falling back to "files".`,
        );
        return "files";
      }
      return "db";
    }
    return "files";
  }

  async findAll(): Promise<{ formId: string; title: string }[]> {
    if (this.source() === "files") {
      return this.recipeFileLoader.findAll();
    }

    const entities = await this.formDefRepo.find({
      order: { createdAt: "DESC" },
    });
    const seen = new Set<string>();
    const result: { formId: string; title: string }[] = [];
    for (const entity of entities) {
      if (!seen.has(entity.formId)) {
        seen.add(entity.formId);
        result.push({ formId: entity.formId, title: entity.schema.title });
      }
    }
    return result;
  }

  async findByFormId({
    formId,
    version,
    includeProcessors = false,
  }: {
    formId: string;
    version?: string;
    includeProcessors?: boolean;
  }): Promise<ServiceContract> {
    const recipe = await this.getRecipe({ formId, version });
    if (!recipe) {
      throw AppError.notFound("Form definition", { formId, version });
    }

    const contract = await this.registryService.hydrateForm(recipe);
    if (includeProcessors) return contract;

    const { processors: _processors, ...stripped } = contract;
    return stripped as ServiceContract;
  }

  /**
   * Resolve a raw recipe by formId (and optional version) from the configured
   * source. Public so other services (e.g. FormDraftsService) can pin draft
   * `formVersion` without reaching into the `form_definitions` table directly
   * — which would expose unpublished builder scratch space (issue #145).
   */
  async getRecipe({
    formId,
    version,
  }: {
    formId: string;
    version?: string;
  }): Promise<ServiceContractRecipe | null> {
    if (this.source() === "files") {
      return this.recipeFileLoader.findByFormId({ formId, version });
    }

    const entity = await this.formDefRepo.findOne({
      where: { formId, ...(version && { version }) },
      order: { createdAt: "DESC" },
    });
    return entity ? entity.schema : null;
  }
}
