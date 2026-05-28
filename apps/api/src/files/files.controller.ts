import { Body, Controller, Post } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import { ApiResponse } from "../common/response";
import type { ApiResponseShape } from "../common/response";
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
  ): Promise<ApiResponseShape<PresignUploadResponseDto>> {
    const data = await this.filesService.presignUpload(dto);
    return ApiResponse.success(data, { message: "Upload URL generated" });
  }

  @Post("confirm-upload")
  @Throttle({ medium: { ttl: 60_000, limit: 60 } })
  async confirmUpload(
    @Body() dto: ConfirmUploadDto,
  ): Promise<ApiResponseShape<FileAttachmentDto>> {
    const data = await this.filesService.confirmUpload(dto);
    return ApiResponse.success(data, { message: "Upload confirmed" });
  }
}
