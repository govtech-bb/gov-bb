import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Put,
  Query,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import {
  ServiceStatusService,
  type ServiceStatusAuditView,
  type ServiceStatusView,
} from "./service-status.service";
import { ServiceStatusAuditQueryDto, UpdateServiceStatusDto } from "./dto";
import { GitHubAuthGuard } from "@/common/guards/github-auth.guard";
import { GitHubLogin } from "@/common/github-login.decorator";
import { ApiResponse } from "@/common/response";
import type { ApiResponseShape } from "@/common/response";

/**
 * Read + admin-mutate endpoints for database-driven service visibility
 * (see PR #1876 for the schema).
 *
 * The audit read and PUT are authenticated by `GitHubAuthGuard` — the caller
 * forwards a GitHub access token (`Authorization: Bearer <github token>`) that
 * the API validates against GitHub, checking org/team membership in production
 * (any authenticated GitHub user in local dev). The verified login is the audit
 * author — it is never taken from the request body. The GET of current statuses
 * is an unauthenticated public read.
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

  @Get("audit")
  @ApiBearerAuth()
  @UseGuards(GitHubAuthGuard)
  async audit(
    @Query() query: ServiceStatusAuditQueryDto,
  ): Promise<ApiResponseShape<ServiceStatusAuditView[]>> {
    const data = await this.serviceStatus.getAuditForSlug(query.slug);
    return ApiResponse.success(data, {
      message: "Service status audit retrieved",
    });
  }

  @Put()
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @UseGuards(GitHubAuthGuard)
  async update(
    @Body() body: UpdateServiceStatusDto,
    @GitHubLogin() author: string,
  ): Promise<ApiResponseShape<ServiceStatusView>> {
    const data = await this.serviceStatus.setStatus(
      body.slug,
      body.status,
      author,
    );
    return ApiResponse.success(data, { message: "Service status updated" });
  }
}
