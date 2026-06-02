import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { FormDefinitionRepository } from "./form-definition.repository";
import {
  RecipeFileLoaderService,
  compareSemver,
} from "./recipe-file-loader.service";
import { RegistryService } from "../../registry/registry.service";
import { AppError } from "../../common/errors";
import type {
  ServiceContract,
  ServiceContractRecipe,
} from "@govtech-bb/form-types";

type RecipeSource = "db" | "files" | "both";

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
    if (raw === "db" || raw === "both") {
      // Honour `db` and `both` only as dev iteration escape hatches. Outside
      // of development (e.g. NODE_ENV=production, =test), force `files` so
      // unpublished `form_definitions` rows can't leak to end users.
      // See issue #145.
      const nodeEnv = this.configService.get<string>("NODE_ENV");
      if (nodeEnv !== "development") {
        this.logger.warn(
          `RECIPE_SOURCE=${raw} is only honored when NODE_ENV=development (got NODE_ENV=${nodeEnv ?? "undefined"}); falling back to "files".`,
        );
        return "files";
      }
      return raw;
    }
    return "files";
  }

  async findAll(): Promise<
    { formId: string; title: string; version: string; category?: string }[]
  > {
    const source = this.source();
    if (source === "files") {
      return this.recipeFileLoader.findAll();
    }

    const dbEntries = await this.findAllFromDb();

    if (source === "db") {
      return dbEntries;
    }

    // source === "both": union of file + DB entries deduped by formId.
    // DB wins on collision so a draft can override a published file recipe.
    const dbFormIds = new Set(dbEntries.map((e) => e.formId));
    const fileEntries = this.recipeFileLoader
      .findAll()
      .filter((e) => !dbFormIds.has(e.formId));
    return [...dbEntries, ...fileEntries];
  }

  private async findAllFromDb(): Promise<
    { formId: string; title: string; version: string; category?: string }[]
  > {
    const entities = await this.formDefRepo.find({
      order: { createdAt: "DESC" },
    });
    const seen = new Set<string>();
    const result: {
      formId: string;
      title: string;
      version: string;
      category?: string;
    }[] = [];
    for (const entity of entities) {
      if (!seen.has(entity.formId)) {
        seen.add(entity.formId);
        result.push({
          formId: entity.formId,
          title: entity.schema.title,
          version: entity.version,
          // See RecipeFileLoaderService.findAll: category mirrors the
          // contact-details title and is omitted when absent.
          ...(entity.schema.contactDetails?.title && {
            category: entity.schema.contactDetails.title,
          }),
        });
      }
    }
    return result;
  }

  async findByFormId({
    formId,
    version,
    includeProcessors = false,
    preview = false,
  }: {
    formId: string;
    version?: string;
    includeProcessors?: boolean;
    preview?: boolean;
  }): Promise<ServiceContract> {
    const recipe = await this.getRecipe({ formId, version, preview });
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
   *
   * When `preview` is `true`, resolution always uses the "both" path regardless
   * of the configured source or NODE_ENV — enabling per-request DB preview.
   */
  async getRecipe({
    formId,
    version,
    preview = false,
  }: {
    formId: string;
    version?: string;
    preview?: boolean;
  }): Promise<ServiceContractRecipe | null> {
    // When preview is true, force "both" so the DB is consulted regardless of
    // the configured RECIPE_SOURCE or NODE_ENV. Otherwise, use the normal
    // source() resolution (which enforces the dev-only guard).
    const effectiveSource: RecipeSource = preview ? "both" : this.source();

    if (effectiveSource === "files") {
      return this.recipeFileLoader.findByFormId({ formId, version });
    }

    if (effectiveSource === "db") {
      return this.getRecipeFromDb({ formId, version });
    }

    // effectiveSource === "both": DB wins on collision. With a version supplied,
    // try DB first and fall through to files on miss. Without a version, pick
    // the candidate with the higher semver across sources (DB wins on tie).
    if (version) {
      const dbRecipe = await this.getRecipeFromDb({ formId, version });
      if (dbRecipe) return dbRecipe;
      return this.recipeFileLoader.findByFormId({ formId, version });
    }

    const dbRecipe = await this.getRecipeFromDb({ formId });
    const fileRecipe = this.recipeFileLoader.findByFormId({ formId });
    if (!dbRecipe) return fileRecipe;
    if (!fileRecipe) return dbRecipe;
    return compareSemver(fileRecipe.version, dbRecipe.version) > 0
      ? fileRecipe
      : dbRecipe;
  }

  private async getRecipeFromDb({
    formId,
    version,
  }: {
    formId: string;
    version?: string;
  }): Promise<ServiceContractRecipe | null> {
    const entity = await this.formDefRepo.findOne({
      where: { formId, ...(version && { version }) },
      order: { createdAt: "DESC" },
    });
    return entity ? entity.schema : null;
  }
}
