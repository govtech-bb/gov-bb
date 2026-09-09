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
  //
  // "short" has to be raised alongside it (#2420). A named override leaves the
  // other registered buckets in force, so overriding "medium" alone left the
  // global short bucket (5 requests / 10s) capping this route at half the rate
  // the medium override declares — the tighter bucket quietly winning. One
  // form step can legitimately ask for several files in a row, so the burst
  // allowance has to fit a whole step; "medium" still holds the sustained rate.
  @Throttle({
    short: { ttl: 10_000, limit: 20 },
    medium: { ttl: 60_000, limit: 30 },
  })
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
  // Raised in step with presign-upload above — see the #2420 note there. Every
  // confirm is preceded by exactly one presign, so a burst allowance that
  // differed between the two would just move the 429 from one call to the other.
  @Throttle({
    short: { ttl: 10_000, limit: 20 },
    medium: { ttl: 60_000, limit: 60 },
  })
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
