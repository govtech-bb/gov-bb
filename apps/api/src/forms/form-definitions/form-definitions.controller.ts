import {
  Controller,
  Get,
  Headers,
  HttpException,
  HttpStatus,
  Param,
  Query,
  Res,
} from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import { ConfigService } from "@nestjs/config";
import type { Response } from "express";
import { FormDefinitionsService } from "./form-definitions.service";
import { FormDisabledOverridesService } from "../form-disabled-overrides/form-disabled-overrides.service";
import { GetFormDefinitionDocs } from "./form-definitions.docs";
import { ApiResponse as AppApiResponse } from "../../common/response";
import { isValidSecretToken } from "../../common/secret-token";
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
    private readonly configService: ConfigService,
  ) {}

  @Get()
  async getAll(): Promise<
    ApiResponseShape<
      { formId: string; title: string; version: string; category?: string }[]
    >
  > {
    // Exclude disabled (tombstoned) forms so the public list matches the 410
    // Gone the single-form GET returns for them — otherwise a disabled form
    // still shows on the forms index and as a landing "Start now" button
    // (issue #615).
    const [data, disabledFormIds] = await Promise.all([
      this.formDefinitionsService.findAll(),
      this.disabledOverridesService.findAllFormIds(),
    ]);
    const disabled = new Set(disabledFormIds);
    const published = data.filter((form) => !disabled.has(form.formId));
    return AppApiResponse.success(published, {
      message: "Form definitions retrieved",
    });
  }

  @Get(":formId")
  @GetFormDefinitionDocs()
  async get(
    @Param("formId") formId: string,
    @Query("version") version?: string,
    @Headers("x-recipe-preview") previewToken?: string,
    @Res({ passthrough: true }) res?: Response,
  ): Promise<ApiResponseShape<ServiceContract>> {
    const override = await this.disabledOverridesService.find(formId);
    if (override) {
      // 410 Gone — the kill switch is engaged. Body shape matches the spec.
      // A disabled form remains disabled even with a valid preview token.
      throw new HttpException(
        { disabled: true, reason: override.reason },
        HttpStatus.GONE,
      );
    }

    const preview = isValidSecretToken(
      this.configService.get<string>("RECIPE_PREVIEW_TOKEN", ""),
      previewToken,
    );

    if (preview) {
      // Prevent CDN/proxy/browser caching for preview responses — the recipe
      // may include unpublished DB content that must not be served from cache.
      res?.setHeader("Cache-Control", "no-store");
    }

    const data = await this.formDefinitionsService.findByFormId({
      formId,
      version,
      preview,
    });
    return AppApiResponse.success(data, {
      message: "Form definition retrieved",
    });
  }
}
