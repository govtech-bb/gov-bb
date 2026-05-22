import {
  Controller,
  Get,
  HttpException,
  HttpStatus,
  Param,
  Query,
} from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import { FormDefinitionsService } from "./form-definitions.service";
import { FormDisabledOverridesService } from "../form-disabled-overrides/form-disabled-overrides.service";
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
    private readonly disabledOverridesService: FormDisabledOverridesService,
  ) {}

  @Get()
  async getAll(): Promise<
    ApiResponseShape<{ formId: string; title: string }[]>
  > {
    // Known trade-off (PR 3): findAll does not filter disabled forms.
    // Ops correlates the list with per-form GET responses. If filtering is
    // needed later, it's a follow-up issue.
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
    const override = await this.disabledOverridesService.find(formId);
    if (override) {
      // 410 Gone — the kill switch is engaged. Body shape matches the spec.
      throw new HttpException(
        { disabled: true, reason: override.reason },
        HttpStatus.GONE,
      );
    }

    const data = await this.formDefinitionsService.findByFormId({
      formId,
      version,
    });
    return AppApiResponse.success(data, {
      message: "Form definition retrieved",
    });
  }
}
