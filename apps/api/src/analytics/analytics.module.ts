import { Module } from "@nestjs/common";
import { AnalyticsController } from "./analytics.controller";
import { AnalyticsRefreshService } from "./analytics-refresh.service";

/**
 * Analytics report cache: a scheduled refresher crawls Umami and caches the
 * report; the controller serves it. Depends on the global DataSource +
 * ScheduleModule (registered in AppModule) and the `umami` config.
 */
@Module({
  controllers: [AnalyticsController],
  providers: [AnalyticsRefreshService],
})
export class AnalyticsModule {}
