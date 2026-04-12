import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { FormDefinitionEntity } from '../../database/entities/form-definition.entity';
import { RegistryService } from '../../registry/registry.service';
import type { ServiceContract, ServiceContractRecipe } from '@govtech-bb/form-types';

@Injectable()
export class FormDefinitionsService {
  constructor(
    @InjectRepository(FormDefinitionEntity)
    private readonly formDefRepo: Repository<FormDefinitionEntity>,
    private readonly registryService: RegistryService,
  ) {}

  async findById(id: string): Promise<ServiceContract> {
    const entity = await this.formDefRepo.findOne({ where: { id } });
    if (!entity) {
      throw new NotFoundException(`Form definition not found: ${id}`);
    }
    return this.hydrate(entity);
  }

  async findByFormIdAndVersion(formId: string, version: string): Promise<ServiceContract> {
    const entity = await this.formDefRepo.findOne({
      where: { formId, version },
    });
    if (!entity) {
      throw new NotFoundException(
        `Form definition not found: formId=${formId}, version=${version}`,
      );
    }
    return this.hydrate(entity);
  }

  async findLatestByFormId(formId: string): Promise<ServiceContract> {
    const entity = await this.formDefRepo.findOne({
      where: { formId },
      order: { createdAt: 'DESC' },
    });
    if (!entity) {
      throw new NotFoundException(`Form definition not found: formId=${formId}`);
    }
    return this.hydrate(entity);
  }

  private async hydrate(entity: FormDefinitionEntity): Promise<ServiceContract> {
    const recipe = entity.schema as unknown as ServiceContractRecipe;
    return this.registryService.hydrateForm(recipe);
  }
}
