import { Body, Controller, Post, UseGuards } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { Throttle, ThrottlerGuard } from "@nestjs/throttler";
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
@UseGuards(ThrottlerGuard)
export class FilesController {
  constructor(private readonly filesService: FilesService) {}

  @Post("presign-upload")
  @Throttle({ default: { ttl: 60_000, limit: 30 } })
  async presignUpload(
    @Body() dto: PresignUploadDto,
  ): Promise<ApiResponseShape<PresignUploadResponseDto>> {
    const data = await this.filesService.presignUpload(dto);
    return ApiResponse.success(data, { message: "Upload URL generated" });
  }

  @Post("confirm-upload")
  @Throttle({ default: { ttl: 60_000, limit: 60 } })
  async confirmUpload(
    @Body() dto: ConfirmUploadDto,
  ): Promise<ApiResponseShape<FileAttachmentDto>> {
    const data = await this.filesService.confirmUpload(dto);
    return ApiResponse.success(data, { message: "Upload confirmed" });
  }
}
