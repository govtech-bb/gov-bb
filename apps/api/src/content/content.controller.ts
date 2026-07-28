import { Controller, Get, Headers } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import { ContentService } from "./content.service";
import type { ServiceIndexEntry } from "./service-index.type";
import {
  authorizeGitHubToken,
  extractBearerToken,
} from "@/common/github-identity";
import { ApiResponse } from "@/common/response";
import type { ApiResponseShape } from "@/common/response";

/**
 * Whether a request may see non-public (preview/draft) services. Soft auth: it
 * never throws — an unauthenticated (or unauthorized) request simply gets the
 * public-only list. A forwarded GitHub token that resolves to an authorized user
 * (any authenticated user in dev; org/team member in production) unlocks all
 * visibilities.
 */
export async function includeNonPublicFromAuth(
  authHeader: string | undefined,
): Promise<boolean> {
  const token = extractBearerToken(authHeader);
  if (!token) return false;
  try {
    return (await authorizeGitHubToken(token)) !== null;
  } catch {
    // Misconfig or GitHub transport error → fail safe to public-only.
    return false;
  }
}

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
