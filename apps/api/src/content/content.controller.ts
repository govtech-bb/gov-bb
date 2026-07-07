import { Controller, Get, Headers } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import { ContentService } from "./content.service";
import type { ServiceIndexEntry } from "./service-index.type";
import { resolveTokenAuth } from "@/common/resolve-token-auth";
import { ApiResponse } from "@/common/response";
import type { ApiResponseShape } from "@/common/response";

/** Parse `Authorization: Bearer <token>` without regex (avoids ReDoS flags). */
function extractBearerToken(header: string | undefined): string | undefined {
  if (!header) return undefined;
  const trimmed = header.trim();
  if (!trimmed.toLowerCase().startsWith("bearer ")) return undefined;
  const token = trimmed.slice(7).trim();
  return token.length > 0 ? token : undefined;
}

/**
 * Whether a request may see non-public (preview/draft) services. Soft auth: it
 * never throws — an unauthenticated request simply gets the public-only list.
 * Mirrors the AdminTokenGuard token resolution (ADR-0061 dev passthrough) but
 * returns a boolean instead of rejecting.
 */
export function includeNonPublicFromAuth(
  authHeader: string | undefined,
): boolean {
  const presented = extractBearerToken(authHeader);
  const expected = [
    process.env.SERVICE_STATUS_ADMIN_TOKEN,
    process.env.ARCHIVE_DRAFTS_TOKEN,
  ].find((v) => !!v);
  const decision = resolveTokenAuth({
    presented,
    expected,
    isProd: process.env.NODE_ENV === "production",
  });
  return decision === "ok" || decision === "passthrough";
}

/**
 * Read-only index of landing services, sourced from a build-time snapshot of the
 * landing content (see scripts/generate-services-index.ts). Public request
 * returns `visibility:public` only; a valid admin bearer token returns all
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
  list(
    @Headers("authorization") auth?: string,
  ): ApiResponseShape<ServiceIndexEntry[]> {
    const data = this.content.list(includeNonPublicFromAuth(auth));
    return ApiResponse.success(data, { message: "Services retrieved" });
  }
}
