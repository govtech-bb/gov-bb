import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
} from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import { AdminToken } from "../../common/admin-token.decorator";
import { FormDisabledOverridesService } from "./form-disabled-overrides.service";
import { DisableFormDto } from "./dto";
import { ApiResponse } from "../../common/response";
import type { ApiResponseShape } from "../../common/response";

interface DisabledStatusResponse {
  disabled: boolean;
  formId: string;
  reason?: string;
  disabledBy?: string;
  disabledAt?: Date;
}

/**
 * Admin endpoints for the per-form kill switch.
 *
 * SECURITY: Stopgap-guarded by @AdminToken() — every endpoint requires a valid
 * `x-admin-token` header (ADMIN_API_TOKEN). This is the interim control until
 * real per-user auth (#11) lands; the load-balancer network ACL stays in place
 * as defence in depth.
 */
@ApiTags("Admin — Form Disabled Overrides")
@ApiBearerAuth()
@AdminToken()
@Controller("admin/form-definitions")
@Throttle({
  short: { limit: 5, ttl: 10_000 },
  medium: { limit: 30, ttl: 60_000 },
})
export class FormDisabledOverridesAdminController {
  constructor(
    private readonly overridesService: FormDisabledOverridesService,
  ) {}

  @Post(":formId/disable")
  @HttpCode(HttpStatus.OK)
  async disable(
    @Param("formId") formId: string,
    @Body() body: DisableFormDto,
  ): Promise<ApiResponseShape<DisabledStatusResponse>> {
    await this.overridesService.disable(formId, body.reason, body.disabledBy);
    return ApiResponse.success(
      { disabled: true, formId },
      { message: "Form disabled" },
    );
  }

  @Delete(":formId/disable")
  @HttpCode(HttpStatus.OK)
  async enable(
    @Param("formId") formId: string,
  ): Promise<ApiResponseShape<DisabledStatusResponse>> {
    await this.overridesService.enable(formId);
    return ApiResponse.success(
      { disabled: false, formId },
      { message: "Form enabled" },
    );
  }

  @Get(":formId/disable")
  async status(
    @Param("formId") formId: string,
  ): Promise<ApiResponseShape<DisabledStatusResponse>> {
    const row = await this.overridesService.find(formId);
    if (!row) {
      return ApiResponse.success(
        { disabled: false, formId },
        { message: "Form is enabled" },
      );
    }
    return ApiResponse.success(
      {
        disabled: true,
        formId,
        reason: row.reason,
        disabledBy: row.disabledBy,
        disabledAt: row.disabledAt,
      },
      { message: "Form is disabled" },
    );
  }
}
