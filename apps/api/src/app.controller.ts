import { Controller, Get } from "@nestjs/common";
import { SkipThrottle } from "@nestjs/throttler";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";

@ApiTags("Health")
@Controller()
@SkipThrottle()
export class AppController {
  @Get("health")
  @ApiOperation({
    summary: "Health check",
    description:
      "Verifies the API is running and the dependency graph resolves correctly.",
  })
  @ApiResponse({
    status: 200,
    description: "API is healthy",
    schema: { type: "string", example: "OK" },
  })
  health(): string {
    return "OK";
  }
}
