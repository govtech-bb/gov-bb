import { Controller, HttpCode, HttpStatus, Param, Post } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
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
export class DraftArchiveController {
  constructor(private readonly draftArchive: DraftArchiveService) {}

  @Post(":formId/:version/archive")
  @HttpCode(HttpStatus.NO_CONTENT)
  async archive(
    @Param("formId") formId: string,
    @Param("version") version: string,
  ): Promise<void> {
    await this.draftArchive.archive({ formId, version });
  }
}
