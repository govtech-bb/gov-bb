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
import { FormDraftsService } from "./form-drafts.service";
import { CreateFormDraftDto, UpdateFormDraftDto } from "./dto";
import { ApiResponse } from "../../common/response";
import type { ApiResponseShape } from "../../common/response";
import type { FormDraftEntity } from "../../database/entities/form-draft.entity";

@Controller("form-drafts")
export class FormDraftsController {
  constructor(private readonly formDraftsService: FormDraftsService) {}

  @Post()
  async create(
    @Body() body: CreateFormDraftDto,
  ): Promise<ApiResponseShape<FormDraftEntity>> {
    const data = await this.formDraftsService.create(body);
    return ApiResponse.success(data, { message: "Draft created" });
  }

  @Get(":draftId")
  async getById(
    @Param("draftId") draftId: string,
  ): Promise<ApiResponseShape<FormDraftEntity>> {
    const data = await this.formDraftsService.findById(draftId);
    return ApiResponse.success(data, { message: "Draft retrieved" });
  }

  @Patch(":draftId")
  async update(
    @Param("draftId") draftId: string,
    @Body() body: UpdateFormDraftDto,
  ): Promise<ApiResponseShape<FormDraftEntity>> {
    const data = await this.formDraftsService.update(draftId, body);
    return ApiResponse.success(data, { message: "Draft updated" });
  }

  @Delete(":draftId")
  @HttpCode(HttpStatus.NO_CONTENT)
  async abandon(@Param("draftId") draftId: string): Promise<void> {
    await this.formDraftsService.abandon(draftId);
  }
}
