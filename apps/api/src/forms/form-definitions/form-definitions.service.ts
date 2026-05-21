import { Injectable, Logger } from "@nestjs/common";
import { FormDefinitionRepository } from "./form-definition.repository";
import { RegistryService } from "../../registry/registry.service";
import { RecipeFileLoader } from "../recipe-file-loader/recipe-file-loader.service";
import { AppError } from "../../common/errors";
import type {
  ServiceContract,
  ServiceContractRecipe,
} from "@govtech-bb/form-types";

@Injectable()
export class FormDefinitionsService {
  private readonly logger = new Logger(FormDefinitionsService.name);

  constructor(
    private readonly formDefRepo: FormDefinitionRepository,
    private readonly registryService: RegistryService,
    private readonly recipeLoader: RecipeFileLoader,
  ) {}

  async findAll(): Promise<{ formId: string; title: string }[]> {
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
    const recipe = await this.loadRecipe(formId, version);
    if (!recipe) {
      throw AppError.notFound("Form definition", { formId, version });
    }

    const contract = await this.registryService.hydrateForm(recipe);
    if (includeProcessors) return contract;

    const { processors: _processors, ...stripped } = contract;
    return stripped as ServiceContract;
  }

  private async loadRecipe(
    formId: string,
    version?: string,
  ): Promise<ServiceContractRecipe | null> {
    const fromFile = version
      ? this.recipeLoader.findVersion(formId, version)
      : this.recipeLoader.findLatest(formId);
    if (fromFile) return fromFile;

    const entity = await this.formDefRepo.findOne({
      where: { formId, ...(version && { version }) },
      order: { createdAt: "DESC" },
    });
    if (!entity) return null;

    this.logger.warn(
      `Recipe served from DB fallback for formId="${formId}"${
        version ? `, version="${version}"` : ""
      } — migration to recipes/ tree is incomplete`,
    );
    return entity.schema as ServiceContractRecipe;
  }
}
