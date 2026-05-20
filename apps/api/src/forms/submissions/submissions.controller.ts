import { Body, Controller, Headers, Post } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import { SubmissionsService } from "./submissions.service";
import { CreateSubmissionDto } from "./dto";
import { CreateSubmissionDocs } from "./submissions.docs";
import { ApiResponse } from "../../common/response";
import type { ApiResponseShape } from "../../common/response";
import type { FormSubmissionEntity } from "../../database/entities/form-submission.entity";
import { SubmissionPayloadSizePipe } from "./submission-payload-size.pipe";

@ApiTags("Submissions")
@ApiBearerAuth()
@Controller("submissions")
export class SubmissionsController {
  constructor(private readonly submissionsService: SubmissionsService) {}

  @Post()
  @Throttle({
    short: { limit: 3, ttl: 10_000 },
    medium: { limit: 10, ttl: 60_000 },
    long: { limit: 50, ttl: 3_600_000 },
  })
  @CreateSubmissionDocs()
  async create(
    @Headers("idempotency-key") idempotencyKey: string,
    @Body(SubmissionPayloadSizePipe) body: CreateSubmissionDto,
  ): Promise<ApiResponseShape<FormSubmissionEntity>> {
    const { data, message, statusCode, deferred } =
      await this.submissionsService.submit({
        ...body,
        idempotencyKey,
      });

    return ApiResponse.success(data, {
      message,
      statusCode,
      ...(deferred && { meta: { deferred } }),
    });
  }
}
