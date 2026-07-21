import { Controller, Get, ServiceUnavailableException } from "@nestjs/common";
import { SkipThrottle } from "@nestjs/throttler";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { DataSource } from "typeorm";

@ApiTags("Health")
@Controller()
@SkipThrottle()
export class AppController {
  constructor(private readonly dataSource: DataSource) {}

  @Get("health")
  @ApiOperation({
    summary: "Liveness check",
    description: "Verifies the API process is running. No dependency checks.",
  })
  @ApiResponse({
    status: 200,
    description: "API process is up",
    schema: { type: "string", example: "OK" },
  })
  health(): string {
    return "OK";
  }

  @Get("health/ready")
  @ApiOperation({
    summary: "Readiness check",
    description:
      "Verifies the API can reach its database (SELECT 1) before it should be " +
      "sent traffic. Returns 503 when the database is unreachable, so a load " +
      "balancer stops routing to a broken instance.",
  })
  @ApiResponse({
    status: 200,
    description: "API is ready to serve",
    schema: { type: "string", example: "OK" },
  })
  @ApiResponse({
    status: 503,
    description: "A dependency (database) is unavailable",
  })
  async ready(): Promise<string> {
    try {
      await this.dataSource.query("SELECT 1");
    } catch {
      throw new ServiceUnavailableException("Database unavailable");
    }
    return "OK";
  }
}
