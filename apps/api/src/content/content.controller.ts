import { Controller, Get, Headers } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import { ContentService } from "./content.service";
import type { ServiceIndexEntry } from "./service-index.type";
import { includeNonPublicFromAuth } from "@/common/include-non-public";
import { ApiResponse } from "@/common/response";
import type { ApiResponseShape } from "@/common/response";

/**
 * Read-only index of landing services, sourced from a build-time snapshot of the
 * landing content (see scripts/generate-services-index.ts). Public request
 * returns `visibility:public` only; a valid, authorized GitHub token returns all
 * visibilities (feature-flagging tool). No mutation here.
 */
@ApiTags("Content")
@Controller("services")
@Throttle({
  short: { limit: 5, ttl: 10_000 },
  medium: { limit: 30, ttl: 60_000 },
})
export class ContentController {
  constructor(private readonly content: ContentService) {}

  @Get()
  async list(
    @Headers("authorization") auth?: string,
  ): Promise<ApiResponseShape<ServiceIndexEntry[]>> {
    const data = await this.content.list(await includeNonPublicFromAuth(auth));
    return ApiResponse.success(data, { message: "Services retrieved" });
  }
}
