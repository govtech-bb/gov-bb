import { HttpModule } from "@nestjs/axios";
import { Module } from "@nestjs/common";
import { FeedService } from "./feed.service";
import { WaterAlertsController } from "./water-alerts.controller";

/**
 * Water-outage alerts (Wuh Water Doing?) — the server side of the service being
 * migrated in from the standalone prototype. Step 2 covers reading the BWA feed
 * for the public map/list; subscribe/confirm/unsubscribe, SES email and the
 * @Cron checker land in later steps.
 */
@Module({
  imports: [HttpModule],
  controllers: [WaterAlertsController],
  providers: [FeedService],
})
export class WaterAlertsModule {}
