import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Request } from "express";
import { isValidSecretToken } from "./secret-token";

/** Request header carrying the shared admin secret. Matches the
 *  apps/form_builder_api X-Admin-Token middleware. */
const ADMIN_TOKEN_HEADER = "x-admin-token";

/**
 * Stopgap auth for admin endpoints (#286): require a valid `x-admin-token`
 * header matching `ADMIN_API_TOKEN`. Analogous to apps/form_builder_api's
 * X-Admin-Token middleware; superseded by real per-user auth (#11).
 *
 * In production a missing `ADMIN_API_TOKEN` is a misconfiguration (also caught
 * at boot by Joi). In non-production an unset token passes through, so local
 * dev and tests need no token.
 */
@Injectable()
export class AdminTokenGuard implements CanActivate {
  constructor(private readonly configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const configured = this.configService.get<string>("ADMIN_API_TOKEN", "");
    const isProduction =
      this.configService.get<string>("NODE_ENV") === "production";

    if (!configured) {
      if (isProduction) {
        throw new InternalServerErrorException(
          "Server misconfigured: ADMIN_API_TOKEN required",
        );
      }
      return true; // dev/test passthrough
    }

    const request = context.switchToHttp().getRequest<Request>();
    const presented = request.headers[ADMIN_TOKEN_HEADER];
    const token = Array.isArray(presented) ? presented[0] : presented;

    if (!token) {
      throw new UnauthorizedException("Missing X-Admin-Token header");
    }
    if (!isValidSecretToken(configured, token)) {
      throw new ForbiddenException("Invalid admin token");
    }
    return true;
  }
}
