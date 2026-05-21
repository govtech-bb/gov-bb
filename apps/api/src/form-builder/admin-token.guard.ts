import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { timingSafeEqual } from "node:crypto";
import type { Request } from "express";

export const ADMIN_TOKEN_HEADER = "x-admin-token";

@Injectable()
export class AdminTokenGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(ctx: ExecutionContext): boolean {
    const expected = this.config.get<string>("ADMIN_API_TOKEN");
    if (!expected) {
      throw new HttpException(
        "Admin endpoint is disabled (ADMIN_API_TOKEN not configured)",
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    const req = ctx.switchToHttp().getRequest<Request>();
    const presented = req.header(ADMIN_TOKEN_HEADER);
    if (!presented) {
      throw new HttpException(
        "Missing X-Admin-Token header",
        HttpStatus.UNAUTHORIZED,
      );
    }

    const a = Buffer.from(presented);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      throw new HttpException("Invalid admin token", HttpStatus.UNAUTHORIZED);
    }

    return true;
  }
}
