import { Body, Controller, Headers, Post } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import { ApiResponse } from "../common/response";
import type { ApiResponseShape } from "../common/response";
import { hasPreviewCookieBypass } from "@/common/preview-cookie";
import { FilesService } from "./files.service";
import {
  ConfirmUploadDto,
  FileAttachmentDto,
  PresignUploadDto,
  PresignUploadResponseDto,
} from "./dto";

@ApiTags("Files")
@Controller("files")
export class FilesController {
  constructor(private readonly filesService: FilesService) {}

  @Post("presign-upload")
  // Override the registered "medium" bucket for this route. Using an unknown
  // name like "default" would add a 4th ad-hoc throttler on top of the three
  // globals instead of overriding one. The global APP_GUARD ThrottlerGuard
  // already covers this controller, so no class-level @UseGuards is needed.
  @Throttle({ medium: { ttl: 60_000, limit: 30 } })
  async presignUpload(
    @Body() dto: PresignUploadDto,
    // Forwarded to resolve a non-public recipe's file-field config server-side,
    // mirroring the form-GET path (#1682). `X-Recipe-Preview` serves the
    // published recipe; `X-Recipe-Draft` sources the in-progress DB scratch.
    // Absent/invalid → published recipes only.
    @Headers("x-recipe-preview") previewToken?: string,
    @Headers("x-recipe-draft") draftToken?: string,
    // Cookie fallback (#2116): once `canDropPreviewToken` removes `?preview=`
    // from the URL, the browser no longer sends the header on this client-side
    // fetch, but it still sends the same-site `preview` cookie. Honour it as a
    // visibility bypass so a non-public form's upload resolves, mirroring the
    // form-GET path. Visibility only — never DB/draft sourcing.
    @Headers("cookie") cookieHeader?: string,
  ): Promise<ApiResponseShape<PresignUploadResponseDto>> {
    const data = await this.filesService.presignUpload(
      dto,
      previewToken,
      draftToken,
      hasPreviewCookieBypass(cookieHeader),
    );
    return ApiResponse.success(data, { message: "Upload URL generated" });
  }

  @Post("confirm-upload")
  @Throttle({ medium: { ttl: 60_000, limit: 60 } })
  async confirmUpload(
    @Body() dto: ConfirmUploadDto,
    @Headers("x-recipe-preview") previewToken?: string,
    @Headers("x-recipe-draft") draftToken?: string,
    // Cookie fallback (#2116) — see presignUpload above.
    @Headers("cookie") cookieHeader?: string,
  ): Promise<ApiResponseShape<FileAttachmentDto>> {
    const data = await this.filesService.confirmUpload(
      dto,
      previewToken,
      draftToken,
      hasPreviewCookieBypass(cookieHeader),
    );
    return ApiResponse.success(data, { message: "Upload confirmed" });
  }
}
