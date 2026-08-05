import { HttpModule } from "@nestjs/axios";
import { Module } from "@nestjs/common";
import { SesMailer } from "../email/ses-mailer";
import { CheckerService } from "./checker.service";
import { FeedService } from "./feed.service";
import { SubscriptionService } from "./subscription.service";
import { WaterAlertsController } from "./water-alerts.controller";
import { WaterSentAlertRepository } from "./water-sent-alert.repository";
import { WaterSubscriberRepository } from "./water-subscriber.repository";

/**
 * Water-outage alerts (Wuh Water Doing?) — the server side of the service being
 * migrated in from the standalone prototype. Covers reading the BWA feed for the
 * public map/list (Step 2) and subscribe/confirm/unsubscribe + confirm email
 * (Step 3). The @Cron checker lands in Step 4.
 */
@Module({
  imports: [HttpModule],
  controllers: [WaterAlertsController],
  providers: [
    FeedService,
    SubscriptionService,
    CheckerService,
    WaterSubscriberRepository,
    WaterSentAlertRepository,
    SesMailer,
  ],
})
export class WaterAlertsModule {}
