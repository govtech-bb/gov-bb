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
 * Reads `Authorization: Bearer <token>` and validates it against the first
 * configured env var in `envVarNames` (default `["ARCHIVE_DRAFTS_TOKEN"]`).
 * Callers that need an independently-rotatable credential pass their own var,
 * with fallbacks after it, e.g.
 * `new AdminTokenGuard("ADMIN_KILL_SWITCH_TOKEN", "ARCHIVE_DRAFTS_TOKEN")` —
 * the first name with a non-empty value in `process.env` wins. This uses the
 * shared dev-bypass policy — ADR 0061:
 *   - no var set + production  → 500 (fail closed; misconfigured server)
 *   - no var set + non-prod    → pass through (local dev)
 *   - a var is set             → presented token must match it, else 401
 *
 * IMPORTANT (deploy safety): the token is read from `process.env` PER-REQUEST,
 * never as a boot-required env var. A required var would crash-loop ECS on a
 * missing value → circuit-breaker rollback. Provision the relevant env var(s)
 * in the apps/api runtime env alongside this guard.
 *
 * IMPORTANT (boot safety): apply this guard as an INSTANCE —
 * `@UseGuards(new AdminTokenGuard(...))` — never as the class reference
 * `@UseGuards(AdminTokenGuard)`. A class reference makes Nest DI-instantiate
 * the guard and resolve the variadic constructor's emitted paramtype
 * (`design:paramtypes` records Array/String), which no provider satisfies →
 * `UnknownDependenciesException` at bootstrap → ECS crash-loop. Unit tests
 * never boot Nest modules, so only `admin-guards-boot.spec.ts` (which compiles
 * the real controllers) catches it.
 */
@Injectable()
export class AdminTokenGuard implements CanActivate {
  private readonly envVarNames: string[];

  constructor(...envVarNames: string[]) {
    this.envVarNames =
      envVarNames.length > 0 ? envVarNames : ["ARCHIVE_DRAFTS_TOKEN"];
  }

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    const presented = extractBearerToken(req.headers.authorization);
    const expected = this.envVarNames
      .map((name) => process.env[name])
      .find((value) => !!value);
    const decision = resolveTokenAuth({
      presented,
      expected,
      isProd: process.env.NODE_ENV === "production",
    });

    switch (decision) {
      case "ok":
      case "passthrough":
        return true;
      case "misconfigured":
        throw new InternalServerErrorException(
          `Server misconfigured: ${this.envVarNames.join(" or ")} required`,
        );
      case "denied":
        throw new UnauthorizedException("Invalid or missing admin token");
    }
  }
}

function extractBearerToken(header: string | undefined): string | undefined {
  if (!header) return undefined;
  const trimmed = header.trim();
  // Parsed linearly (scheme test + slice + trim) rather than with
  // /^Bearer\s+(.+)$/i: CodeQL flags that regex's overlapping \s+/.+
  // quantifiers as js/polynomial-redos. The practical risk is negligible
  // (headers are size-capped and this anchored pattern backtracks linearly),
  // so the shape below is scanner compliance, not a load-bearing defence.
  if (!/^bearer/i.test(trimmed)) return undefined;
  const rest = trimmed.slice("bearer".length);
  if (!/^\s/.test(rest)) return undefined;
  const token = rest.trim();
  return token || undefined;
}
