import { Module } from "@nestjs/common";
import { FeedbackController } from "./feedback.controller";
import { FeedbackService } from "./feedback.service";

// Self-contained: relies only on the global ConfigModule and the @Global
// TelemetryModule (MetricsService). It deliberately does not touch the
// form-submission recipe/SQS pipeline — it sends straight to SES (#1298).
@Module({
  controllers: [FeedbackController],
  providers: [FeedbackService],
})
export class FeedbackModule {}
