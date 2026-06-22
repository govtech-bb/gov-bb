import { applyDecorators, UseGuards } from "@nestjs/common";
import { AdminTokenGuard } from "./admin-token.guard";

/**
 * Stopgap admin auth (#286): guards a controller (or handler) behind the
 * `x-admin-token` shared secret (`ADMIN_API_TOKEN`). See AdminTokenGuard.
 */
export function AdminToken() {
  return applyDecorators(UseGuards(AdminTokenGuard));
}
