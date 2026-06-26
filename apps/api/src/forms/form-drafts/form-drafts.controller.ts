import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
} from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import { FormDraftsService } from "./form-drafts.service";
import { CreateFormDraftDto, UpdateFormDraftDto } from "./dto";
import {
  AbandonDraftDocs,
  CreateDraftDocs,
  GetDraftDocs,
  UpdateDraftDocs,
} from "./form-drafts.docs";
import { ApiResponse } from "@/common/response";
import type { ApiResponseShape } from "@/common/response";
import type { FormDraftEntity } from "@/database/entities/form-draft.entity";

@ApiTags("Form Drafts")
@ApiBearerAuth()
@Controller("form-drafts")
@Throttle({
  short: { limit: 5, ttl: 10_000 },
  medium: { limit: 30, ttl: 60_000 },
})
export class FormDraftsController {
  constructor(private readonly formDraftsService: FormDraftsService) {}

  @Post()
  @CreateDraftDocs()
  async create(
    @Body() body: CreateFormDraftDto,
  ): Promise<ApiResponseShape<FormDraftEntity>> {
    const data = await this.formDraftsService.create(body);
    return ApiResponse.success(data, { message: "Draft created" });
  }

  @Get(":draftId")
  @GetDraftDocs()
  async getById(
    @Param("draftId") draftId: string,
  ): Promise<ApiResponseShape<FormDraftEntity>> {
    const data = await this.formDraftsService.findById(draftId);
    return ApiResponse.success(data, { message: "Draft retrieved" });
  }

  @Patch(":draftId")
  @UpdateDraftDocs()
  async update(
    @Param("draftId") draftId: string,
    @Body() body: UpdateFormDraftDto,
  ): Promise<ApiResponseShape<FormDraftEntity>> {
    const data = await this.formDraftsService.update(draftId, body);
    return ApiResponse.success(data, { message: "Draft updated" });
  }

  @Delete(":draftId")
  @HttpCode(HttpStatus.NO_CONTENT)
  @AbandonDraftDocs()
  async abandon(@Param("draftId") draftId: string): Promise<void> {
    await this.formDraftsService.abandon(draftId);
  }
}
