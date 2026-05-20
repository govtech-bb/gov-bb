import { Controller, Get, Param, Query } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import { FormDefinitionsService } from "./form-definitions.service";
import { GetFormDefinitionDocs } from "./form-definitions.docs";
import { ApiResponse as AppApiResponse } from "../../common/response";
import type { ApiResponseShape } from "../../common/response";
import type { ServiceContract } from "@govtech-bb/form-types";

@ApiTags("Form Definitions")
@ApiBearerAuth()
@Controller("form-definitions")
@Throttle({
  short: { limit: 20, ttl: 10_000 },
  medium: { limit: 120, ttl: 60_000 },
})
export class FormDefinitionsController {
  constructor(
    private readonly formDefinitionsService: FormDefinitionsService,
  ) {}

  @Get()
  async getAll(): Promise<
    ApiResponseShape<{ formId: string; title: string }[]>
  > {
    const data = await this.formDefinitionsService.findAll();
    return AppApiResponse.success(data, {
      message: "Form definitions retrieved",
    });
  }

  @Get(":formId")
  @GetFormDefinitionDocs()
  async get(
    @Param("formId") formId: string,
    @Query("version") version?: string,
  ): Promise<ApiResponseShape<ServiceContract>> {
    const data = await this.formDefinitionsService.findByFormId({
      formId,
      version,
    });
    return AppApiResponse.success(data, {
      message: "Form definition retrieved",
    });
  }
}
