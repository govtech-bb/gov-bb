import { Controller, Get, ServiceUnavailableException } from "@nestjs/common";
import { SkipThrottle } from "@nestjs/throttler";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { DataSource } from "typeorm";

// Cap the readiness DB check so a *hung* connection (vs. a refused one) fails
// fast with 503 instead of hanging until the routing probe's own timeout. Kept
// under a typical ALB target-group timeout so the app returns a clean 503 first.
export const READINESS_TIMEOUT_MS = 2000;

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
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => reject(new Error("readiness check timed out")),
        READINESS_TIMEOUT_MS,
      );
    });
    try {
      await Promise.race([this.dataSource.query("SELECT 1"), timeout]);
    } catch {
      throw new ServiceUnavailableException("Database unavailable");
    } finally {
      clearTimeout(timer);
    }
    return "OK";
  }
}
