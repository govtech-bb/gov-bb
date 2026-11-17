import { Controller, Get, Param } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import { ApiResponse } from "@/common/response";
import type { ApiResponseShape } from "@/common/response";
import { STATUS_LOOKUP_THROTTLE } from "./chat-caller-throttle";
import {
  SubmissionStatusService,
  type SubmissionStatusAnswer,
} from "./submission-status.service";

/**
 * Where an application has got to, for the chat (#3419). An unauthenticated
 * public read, like the application tracker: the reference is the access.
 * 200 with an answer; 503 when the tracker can't answer. Anything unexpected
 * (the database is down) is a 500. The chat treats every non-2xx the same.
 *
 * Throttled per IP, except the chat, which proves itself with
 * X-Chat-Caller-Token and gets one higher limit for all its users (#3623).
 */
@ApiTags("Submissions")
@Controller("submissions")
export class SubmissionStatusController {
  constructor(private readonly status: SubmissionStatusService) {}

  @Get(":reference/status")
  @Throttle(STATUS_LOOKUP_THROTTLE)
  async lookup(
    @Param("reference") reference: string,
  ): Promise<ApiResponseShape<SubmissionStatusAnswer>> {
    return ApiResponse.success(await this.status.lookup(reference), {
      message: "Submission status retrieved",
    });
  }
}
