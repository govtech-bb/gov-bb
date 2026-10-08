import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import NodeCache from "node-cache";
import { CustomComponent } from "./entities/custom-component.entity";
import { getCatalog, hydrateForm } from "@govtech-bb/form-builder";
import type {
  RegistryCatalog,
  CustomComponentEntry,
} from "@govtech-bb/form-builder";
import type {
  ServiceContract,
  ServiceContractRecipe,
} from "@govtech-bb/form-types";

const CACHE_TTL_SECONDS = 60;
const CACHE_KEY = "__catalog__";

@Injectable()
export class RegistryService {
  private readonly logger = new Logger(RegistryService.name);

  private readonly cache = new NodeCache({ stdTTL: CACHE_TTL_SECONDS });

  constructor(
    @InjectRepository(CustomComponent)
    private readonly customComponentRepo: Repository<CustomComponent>,
  ) {}

  async hydrateForm(recipe: ServiceContractRecipe): Promise<ServiceContract> {
    const catalog = await this.getCatalog();
    return hydrateForm(recipe, catalog);
  }

  /**
   * The registry catalog the shared `hydrateForm` resolves refs against.
   * Builtins resolve via the package's registry fallback, so only DB-backed
   * custom components need to be merged on top. Cached for 60s so hydration
   * doesn't hit the database on every request.
   */
  private async getCatalog(): Promise<RegistryCatalog> {
    const cached = this.cache.get<RegistryCatalog>(CACHE_KEY);
    if (cached) return cached;

    this.logger.debug("Registry catalog stale — reloading custom components");

    const customs = await this.customComponentRepo.find();
    const custom: CustomComponentEntry[] = customs.map((c) => ({
      ref: `components/${c.namespace}/${c.type}`,
      displayName: `${c.namespace}/${c.type}`,
      namespace: c.namespace,
      type: c.type,
      definition: c.definition,
    }));
    const catalog: RegistryCatalog = { ...getCatalog(), custom };

    this.cache.set(CACHE_KEY, catalog);
    this.logger.debug(
      `Loaded ${customs.length} custom component(s) into catalog`,
    );

    return catalog;
  }
}
