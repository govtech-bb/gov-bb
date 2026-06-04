import { Controller, HttpCode, HttpStatus, Param, Post } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { DraftArchiveService } from "./draft-archive.service";

/**
 * Admin endpoint for archiving builder drafts (`form_definitions` rows)
 * after the corresponding recipe is merged into `dev` via the publish flow.
 *
 * NOTE: This endpoint is auth-gated per issue #11. Until that lands, it is
 * reachable only from inside the VPC (network ACL). The
 * archive-merged-drafts.yml workflow runs from a GitHub-hosted runner; the
 * workflow either runs against a publicly-reachable URL with a bearer token
 * from secrets, or, when the network ACL is tightened, switches to a
 * self-hosted runner inside the VPC. See workflow comments for the current
 * configuration.
 */
@ApiTags("Admin — Drafts")
@ApiBearerAuth()
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
