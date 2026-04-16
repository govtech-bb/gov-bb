import { Injectable } from '@nestjs/common';
import { FormDefinitionRepository } from './form-definition.repository';
import { RegistryService } from '../../registry/registry.service';
import { AppError } from '../../common/errors';
import type { ServiceContract } from '@govtech-bb/form-types';

@Injectable()
export class FormDefinitionsService {
  constructor(
    private readonly formDefRepo: FormDefinitionRepository,
    private readonly registryService: RegistryService,
  ) {}

  async findByFormId({ formId, version }: { formId: string; version?: string }): Promise<ServiceContract> {
    const entity = await this.formDefRepo.findOne({
      where: { formId, ...(version && { version }) },
      order: { createdAt: 'DESC' },
    });

    if (!entity) {
      throw AppError.notFound('Form definition', { formId, version });
    }
    return this.registryService.hydrateForm(entity.schema);
  }
}
