import { Injectable } from "@nestjs/common";
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
  constructor(
    private readonly formDefRepo: FormDefinitionRepository,
    private readonly registryService: RegistryService,
    private readonly recipeFileLoader: RecipeFileLoaderService,
    private readonly configService: ConfigService,
  ) {}

  private source(): RecipeSource {
    const raw = this.configService.get<string>("RECIPE_SOURCE", "db");
    return raw === "files" ? "files" : "db";
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
    const recipe = await this.loadRecipe({ formId, version });
    if (!recipe) {
      throw AppError.notFound("Form definition", { formId, version });
    }

    const contract = await this.registryService.hydrateForm(recipe);
    if (includeProcessors) return contract;

    const { processors: _processors, ...stripped } = contract;
    return stripped as ServiceContract;
  }

  private async loadRecipe({
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
