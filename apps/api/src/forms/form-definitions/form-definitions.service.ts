import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { FormDefinitionEntity } from "../../database/entities/form-definition.entity";
import { RegistryService } from "../../registry/registry.service";
import { AppError } from "../../common/errors";
import type { ServiceContract } from "@govtech-bb/form-types";

@Injectable()
export class FormDefinitionsService {
  constructor(
    @InjectRepository(FormDefinitionEntity)
    private readonly formDefRepo: Repository<FormDefinitionEntity>,
    private readonly registryService: RegistryService,
  ) {}

  async findByFormId({
    formId,
    version,
  }: {
    formId: string;
    version?: string;
  }): Promise<ServiceContract> {
    const entity = await this.formDefRepo.findOne({
      where: { formId, ...(version && { version }) },
      order: { createdAt: "DESC" },
    });

    if (!entity) {
      throw AppError.notFound("Form definition", { formId, version });
    }
    return this.registryService.hydrateForm(entity.schema);
  }
}
