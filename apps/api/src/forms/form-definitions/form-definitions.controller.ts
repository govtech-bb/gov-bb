import { Controller, Get, Param, Query } from '@nestjs/common';
import { FormDefinitionsService } from './form-definitions.service';
import type { ServiceContract } from '@govtech-bb/form-types';

@Controller('form-definitions')
export class FormDefinitionsController {
  constructor(private readonly formDefinitionsService: FormDefinitionsService) {}

  @Get(':id')
  async getById(
    @Param('id') id: string,
    @Query('version') version?: string,
  ): Promise<ServiceContract> {
    if (version) {
      return this.formDefinitionsService.findByFormIdAndVersion(id, version);
    }
    return this.formDefinitionsService.findById(id);
  }

  @Get('by-form-id/:formId')
  async getByFormId(
    @Param('formId') formId: string,
    @Query('version') version?: string,
  ): Promise<ServiceContract> {
    if (version) {
      return this.formDefinitionsService.findByFormIdAndVersion(formId, version);
    }
    return this.formDefinitionsService.findLatestByFormId(formId);
  }
}
