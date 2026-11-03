import { Controller, Get, Param } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { ApiResponse } from "@/common/response";
import type { ApiResponseShape } from "@/common/response";
import {
  SubmissionStatusService,
  type SubmissionStatusAnswer,
} from "./submission-status.service";

/**
 * Where an application has got to, for the chat (#3419). An unauthenticated
 * public read, like the application tracker: the reference is the access.
 * Always 200 with an answer; 503 when the answer can't be worked out.
 */
@ApiTags("Submissions")
@Controller("submissions")
export class SubmissionStatusController {
  constructor(private readonly status: SubmissionStatusService) {}

  @Get(":reference/status")
  async lookup(
    @Param("reference") reference: string,
  ): Promise<ApiResponseShape<SubmissionStatusAnswer>> {
    return ApiResponse.success(await this.status.lookup(reference), {
      message: "Submission status retrieved",
    });
  }
}
