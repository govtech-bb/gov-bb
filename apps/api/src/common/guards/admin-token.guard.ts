import {
  CanActivate,
  ExecutionContext,
  Injectable,
  InternalServerErrorException,
  UnauthorizedException,
} from "@nestjs/common";
import type { Request } from "express";
import { resolveTokenAuth } from "../resolve-token-auth";

/**
 * Authenticates the apps/api admin endpoints (the per-form kill switch and the
 * draft-archive endpoint) behind a shared admin token.
 *
 * Reads `Authorization: Bearer <token>` and validates it against
 * `ARCHIVE_DRAFTS_TOKEN` (the secret the archive-merged-drafts workflow already
 * sends) using the shared dev-bypass policy — ADR 0061:
 *   - token unset + production  → 500 (fail closed; misconfigured server)
 *   - token unset + non-prod    → pass through (local dev)
 *   - token set                 → must match, else 401
 *
 * IMPORTANT (deploy safety): the token is read from `process.env` PER-REQUEST,
 * never as a boot-required env var. A required var would crash-loop ECS on a
 * missing value → circuit-breaker rollback. Provision ARCHIVE_DRAFTS_TOKEN in
 * the apps/api runtime env alongside this guard.
 */
@Injectable()
export class AdminTokenGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    const presented = extractBearerToken(req.headers.authorization);
    const decision = resolveTokenAuth({
      presented,
      expected: process.env.ARCHIVE_DRAFTS_TOKEN,
      isProd: process.env.NODE_ENV === "production",
    });

    switch (decision) {
      case "ok":
      case "passthrough":
        return true;
      case "misconfigured":
        throw new InternalServerErrorException(
          "Server misconfigured: ARCHIVE_DRAFTS_TOKEN required",
        );
      case "denied":
        throw new UnauthorizedException("Invalid or missing admin token");
    }
  }
}

function extractBearerToken(header: string | undefined): string | undefined {
  if (!header) return undefined;
  const trimmed = header.trim();
  // Match the "Bearer" scheme (case-insensitive) followed by a whitespace
  // separator, then take the remainder as the token. Parsed without a
  // `\s+(.+)` regex, whose overlapping quantifiers backtrack polynomially on a
  // crafted "Bearer" + long whitespace run (ReDoS).
  if (!/^bearer/i.test(trimmed)) return undefined;
  const rest = trimmed.slice("bearer".length);
  if (!/^\s/.test(rest)) return undefined;
  const token = rest.trim();
  return token || undefined;
}
