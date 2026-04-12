import { Controller, Get, Param, Query } from '@nestjs/common';
import { FormDefinitionsService } from './form-definitions.service';
import { ApiResponse } from '../../common/response';
import type { ApiResponseShape } from '../../common/response';
import type { ServiceContract } from '@govtech-bb/form-types';

@Controller('form-definitions')
export class FormDefinitionsController {
  constructor(private readonly formDefinitionsService: FormDefinitionsService) {}

  @Get(':formId')
  async get(
    @Param('formId') formId: string,
    @Query('version') version?: string,
  ): Promise<ApiResponseShape<ServiceContract>> {
    const data = await this.formDefinitionsService.findByFormId({ formId, version });
    return ApiResponse.success(data, { message: 'Form definition retrieved' });
  }
}
