import { Body, Controller, Headers, Post, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { ThrottlerGuard } from "@nestjs/throttler";
import { SubmissionsService } from "./submissions.service";
import { CreateSubmissionDto } from "./dto";
import { CreateSubmissionDocs } from "./submissions.docs";
import { ApiResponse } from "../../common/response";
import type { ApiResponseShape } from "../../common/response";
import type { FormSubmissionEntity } from "../../database/entities/form-submission.entity";

@ApiTags("Submissions")
@ApiBearerAuth()
@Controller("submissions")
export class SubmissionsController {
  constructor(private readonly submissionsService: SubmissionsService) {}

  @Post()
  @UseGuards(ThrottlerGuard)
  @CreateSubmissionDocs()
  async create(
    @Headers("idempotency-key") idempotencyKey: string,
    @Body() body: CreateSubmissionDto,
  ): Promise<ApiResponseShape<FormSubmissionEntity>> {
    const { data, message, statusCode } = await this.submissionsService.submit({
      ...body,
      idempotencyKey,
    });

    return ApiResponse.success(data, { message, statusCode });
  }
}
