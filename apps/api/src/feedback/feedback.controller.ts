import { Body, Controller, Post } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import { FeedbackService } from "./feedback.service";
import { CreateFeedbackDto } from "./dto/create-feedback.dto";
import { ApiResponse } from "../common/response";
import type { ApiResponseShape } from "../common/response";

@ApiTags("Feedback")
@Controller("feedback")
export class FeedbackController {
  constructor(private readonly feedbackService: FeedbackService) {}

  @Post()
  // Site feedback is low-volume and unauthenticated, so cap it tighter than
  // the global default to blunt abuse (defense-in-depth alongside the WAF).
  @Throttle({
    short: { limit: 3, ttl: 10_000 },
    medium: { limit: 10, ttl: 60_000 },
    long: { limit: 50, ttl: 3_600_000 },
  })
  @ApiOperation({ summary: "Submit public site feedback (emails the team)" })
  async create(
    @Body() body: CreateFeedbackDto,
  ): Promise<ApiResponseShape<null>> {
    await this.feedbackService.send(body);
    return ApiResponse.success(null, { message: "Feedback sent" });
  }
}
