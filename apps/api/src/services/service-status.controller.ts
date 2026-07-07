import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Put,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import {
  ServiceStatusService,
  type ServiceStatusView,
} from "./service-status.service";
import { UpdateServiceStatusDto } from "./dto";
import { AdminTokenGuard } from "@/common/guards/admin-token.guard";
import { ApiResponse } from "@/common/response";
import type { ApiResponseShape } from "@/common/response";

/**
 * Read + admin-mutate endpoints for database-driven service visibility
 * (see PR #1876 for the schema).
 *
 * The PUT is authenticated by `AdminTokenGuard` — every request must carry a
 * valid `Authorization: Bearer <SERVICE_STATUS_ADMIN_TOKEN>`, falling back to
 * `ARCHIVE_DRAFTS_TOKEN` while the dedicated var is unset (dev-bypass policy per
 * ADR 0061). The GET is an unauthenticated read of current statuses.
 */
@ApiTags("Service Status")
@Controller("service_status")
@Throttle({
  short: { limit: 5, ttl: 10_000 },
  medium: { limit: 30, ttl: 60_000 },
})
export class ServiceStatusController {
  constructor(private readonly serviceStatus: ServiceStatusService) {}

  @Get()
  async list(): Promise<ApiResponseShape<ServiceStatusView[]>> {
    const data = await this.serviceStatus.list();
    return ApiResponse.success(data, {
      message: "Service statuses retrieved",
    });
  }

  @Put()
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @UseGuards(
    new AdminTokenGuard("SERVICE_STATUS_ADMIN_TOKEN", "ARCHIVE_DRAFTS_TOKEN"),
  )
  async update(
    @Body() body: UpdateServiceStatusDto,
  ): Promise<ApiResponseShape<ServiceStatusView>> {
    const data = await this.serviceStatus.setStatus(
      body.slug,
      body.status,
      body.author,
    );
    return ApiResponse.success(data, { message: "Service status updated" });
  }
}
