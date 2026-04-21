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
import {
  ApiBearerAuth,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from "@nestjs/swagger";
import { FormDraftsService } from "./form-drafts.service";
import { CreateFormDraftDto, UpdateFormDraftDto } from "./dto";
import { FormDraftEntity } from "../../database/entities/form-draft.entity";
import { ApiWrappedResponse } from "../../common/swagger";
import { ApiResponse } from "../../common/response";
import type { ApiResponseShape } from "../../common/response";

@ApiTags("Form Drafts")
@ApiBearerAuth()
@Controller("form-drafts")
export class FormDraftsController {
  constructor(private readonly formDraftsService: FormDraftsService) {}

  @Post()
  @ApiOperation({
    summary: "Create a form draft",
    description:
      "Creates a new draft for the given form, pinning the form version at creation time. " +
      "If a draft with the same draftId already exists, the existing draft is returned (idempotent).",
  })
  @ApiWrappedResponse({ status: 201, type: FormDraftEntity, description: "Draft created (or existing draft returned)" })
  @ApiNotFoundResponse({ description: "Form definition not found" })
  async create(
    @Body() body: CreateFormDraftDto,
  ): Promise<ApiResponseShape<FormDraftEntity>> {
    const data = await this.formDraftsService.create(body);
    return ApiResponse.success(data, { message: "Draft created" });
  }

  @Get(":draftId")
  @ApiOperation({ summary: "Get a draft by ID" })
  @ApiParam({ name: "draftId", description: "The client-supplied draft identifier", example: "user-123-passport-draft" })
  @ApiWrappedResponse({ status: 200, type: FormDraftEntity, description: "Draft retrieved" })
  @ApiNotFoundResponse({ description: "Draft not found" })
  async getById(
    @Param("draftId") draftId: string,
  ): Promise<ApiResponseShape<FormDraftEntity>> {
    const data = await this.formDraftsService.findById(draftId);
    return ApiResponse.success(data, { message: "Draft retrieved" });
  }

  @Patch(":draftId")
  @ApiOperation({
    summary: "Update a draft",
    description:
      "Merges the supplied values into the existing draft values. " +
      "Existing fields not included in the payload are preserved.",
  })
  @ApiParam({ name: "draftId", description: "The client-supplied draft identifier", example: "user-123-passport-draft" })
  @ApiWrappedResponse({ status: 200, type: FormDraftEntity, description: "Draft updated" })
  @ApiNotFoundResponse({ description: "Draft not found" })
  async update(
    @Param("draftId") draftId: string,
    @Body() body: UpdateFormDraftDto,
  ): Promise<ApiResponseShape<FormDraftEntity>> {
    const data = await this.formDraftsService.update(draftId, body);
    return ApiResponse.success(data, { message: "Draft updated" });
  }

  @Delete(":draftId")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: "Abandon a draft",
    description: "Marks the draft as abandoned. Abandoned drafts are purged after 7 days.",
  })
  @ApiParam({ name: "draftId", description: "The client-supplied draft identifier", example: "user-123-passport-draft" })
  @ApiNoContentResponse({ description: "Draft abandoned" })
  @ApiNotFoundResponse({ description: "Draft not found" })
  async abandon(@Param("draftId") draftId: string): Promise<void> {
    await this.formDraftsService.abandon(draftId);
  }
}
