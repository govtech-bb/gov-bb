import {
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { AdminTokenGuard } from "@/common/guards/admin-token.guard";
import { DraftArchiveService } from "./draft-archive.service";

/**
 * Admin endpoint for archiving builder drafts (`form_definitions` rows)
 * after the corresponding recipe is merged into `dev` via the publish flow.
 *
 * SECURITY: Authenticated by `AdminTokenGuard` — the archive-merged-drafts.yml
 * workflow already sends `Authorization: Bearer <ARCHIVE_DRAFTS_TOKEN>`, which
 * this guard now validates (dev-bypass policy per ADR 0061). The network ACL
 * remains as defence in depth.
 */
@ApiTags("Admin — Drafts")
@ApiBearerAuth()
@UseGuards(AdminTokenGuard)
@Controller("admin/drafts")
export class DraftArchiveController {
  constructor(private readonly draftArchive: DraftArchiveService) {}

  @Post(":formId/archive")
  @HttpCode(HttpStatus.NO_CONTENT)
  async archive(@Param("formId") formId: string): Promise<void> {
    await this.draftArchive.archive({ formId });
  }
}
