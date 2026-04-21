import { Body, Controller, Headers, Post, UseGuards } from "@nestjs/common";
import { ThrottlerGuard } from "@nestjs/throttler";
import { SubmissionsService } from "./submissions.service";
import { CreateSubmissionDto } from "./dto";
import { ApiResponse } from "../../common/response";
import type { ApiResponseShape } from "../../common/response";
import type { FormSubmissionEntity } from "../../database/entities/form-submission.entity";

@Controller("submissions")
export class SubmissionsController {
  constructor(private readonly submissionsService: SubmissionsService) {}

  @Post()
  @UseGuards(ThrottlerGuard)
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
