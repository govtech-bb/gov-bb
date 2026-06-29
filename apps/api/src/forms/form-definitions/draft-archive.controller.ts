import { Controller, HttpCode, HttpStatus, Param, Post } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import { AdminToken } from "../../common/admin-token.decorator";
import { DraftArchiveService } from "./draft-archive.service";

/**
 * Admin endpoint for archiving builder drafts (`form_definitions` rows)
 * after the corresponding recipe is merged into `dev` via the publish flow.
 *
 * SECURITY: Stopgap-guarded by @AdminToken() — requires a valid `x-admin-token`
 * header (ADMIN_API_TOKEN), the interim control until real per-user auth (#11)
 * lands. The archive-merged-drafts.yml workflow must send that header (from
 * secrets); the load-balancer network ACL stays in place as defence in depth.
 */
@ApiTags("Admin — Drafts")
@ApiBearerAuth()
@AdminToken()
@Controller("admin/drafts")
// Throttle token-guessing on this endpoint (mirrors the disabled-overrides admin
// controller). Low risk with a high-entropy secret, but cheap defence in depth.
@Throttle({
  short: { limit: 5, ttl: 10_000 },
  medium: { limit: 30, ttl: 60_000 },
})
export class DraftArchiveController {
  constructor(private readonly draftArchive: DraftArchiveService) {}

  @Post(":formId/archive")
  @HttpCode(HttpStatus.NO_CONTENT)
  async archive(@Param("formId") formId: string): Promise<void> {
    await this.draftArchive.archive({ formId });
  }
}
