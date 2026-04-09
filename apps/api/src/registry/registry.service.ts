import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import NodeCache from 'node-cache';
import { CustomComponent } from './entities/custom-component.entity';
import { BUILTIN_REGISTRY, RegistryEntry } from './builtins';
import { hydrateForm, Resolver, UnresolvableComponentError } from './resolution';
import type { ServiceContract, ServiceContractRecipe } from './types/service-contract.type';

const CACHE_TTL_SECONDS = 60;
const CACHE_LOADED_KEY = '__loaded__';

export interface IRegistryService {
  resolve(ref: string): Promise<RegistryEntry | null>;
  hydrateForm(recipe: ServiceContractRecipe): Promise<ServiceContract>;
}

@Injectable()
export class RegistryService implements IRegistryService {
  private readonly logger = new Logger(RegistryService.name);

  private readonly builtins: ReadonlyMap<string, RegistryEntry> = new Map(
    Object.entries(BUILTIN_REGISTRY),
  );

  private readonly cache = new NodeCache({ stdTTL: CACHE_TTL_SECONDS });

  constructor(
    @InjectRepository(CustomComponent)
    private readonly customComponentRepo: Repository<CustomComponent>,
  ) {}

  async resolve(ref: string): Promise<RegistryEntry | null> {
    const builtin = this.builtins.get(ref);
    if (builtin) return builtin;

    await this.ensureCacheFresh();

    return this.cache.get<RegistryEntry>(ref) ?? null;
  }

  async hydrateForm(recipe: ServiceContractRecipe): Promise<ServiceContract> {
    const resolver: Resolver = (ref) => this.resolve(ref);
    return hydrateForm(recipe, resolver);
  }

  private async ensureCacheFresh(): Promise<void> {
    if (this.cache.has(CACHE_LOADED_KEY)) return;

    this.logger.debug('Custom component cache stale — reloading from database');

    this.cache.flushAll();
    const customs = await this.customComponentRepo.find();

    for (const custom of customs) {
      this.cache.set(`components/${custom.namespace}/${custom.type}`, custom.definition);
    }

    this.cache.set(CACHE_LOADED_KEY, true);
    this.logger.debug(`Loaded ${customs.length} custom component(s) into cache`);
  }
}

export { UnresolvableComponentError };
