import { Body, Controller, Headers, Post } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import { ConfigService } from "@nestjs/config";
import { SubmissionsService } from "./submissions.service";
import { CreateSubmissionDto } from "./dto";
import { CreateSubmissionDocs } from "./submissions.docs";
import { ApiResponse } from "../../common/response";
import { isValidSecretToken } from "../../common/secret-token";
import type { ApiResponseShape } from "../../common/response";
import type { FormSubmissionEntity } from "../../database/entities/form-submission.entity";
import { SubmissionPayloadSizePipe } from "./submission-payload-size.pipe";

@ApiTags("Submissions")
@ApiBearerAuth()
@Controller("submissions")
export class SubmissionsController {
  constructor(
    private readonly submissionsService: SubmissionsService,
    private readonly configService: ConfigService,
  ) {}

  @Post()
  @Throttle({
    short: { limit: 3, ttl: 10_000 },
    medium: { limit: 10, ttl: 60_000 },
    long: { limit: 50, ttl: 3_600_000 },
  })
  @CreateSubmissionDocs()
  async create(
    @Headers("idempotency-key") idempotencyKey: string,
    @Headers("x-smoke-submission") smokeToken: string | undefined,
    @Body(SubmissionPayloadSizePipe) body: CreateSubmissionDto,
  ): Promise<ApiResponseShape<FormSubmissionEntity>> {
    // Drop every processor for a smoke-originated submission — but only when
    // the header carries the configured SMOKE_SUBMISSION_TOKEN. Fail-closed:
    // when the secret is unset (every ordinary environment / public caller),
    // isValidSecretToken returns false and processors fire as normal (#1252).
    const isSmokeSubmission = isValidSecretToken(
      this.configService.get<string>("SMOKE_SUBMISSION_TOKEN", ""),
      smokeToken,
    );

    const { data, message, statusCode, deferred } =
      await this.submissionsService.submit({
        ...body,
        idempotencyKey,
        ...(isSmokeSubmission && { isSmokeSubmission: true }),
      });

    return ApiResponse.success(data, {
      message,
      statusCode,
      ...(deferred && { meta: { deferred } }),
    });
  }
}
