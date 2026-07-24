import { Module } from "@nestjs/common";
import { MonitoringController } from "./monitoring.controller";
import { NotificationLogRepository } from "@/forms/submissions/notification-log.repository";
import { WebhookDestinationsModule } from "@/forms/webhook-destinations/webhook-destinations.module";

/**
 * Internal monitoring endpoints for the observability console. Provides its own
 * NotificationLogRepository instance (a thin, stateless TypeORM repository over
 * the global DataSource), so it stays decoupled from SubmissionsModule.
 * Imports WebhookDestinationsModule to surface the per-MDA destinations audit.
 */
@Module({
  imports: [WebhookDestinationsModule],
  controllers: [MonitoringController],
  providers: [NotificationLogRepository],
})
export class MonitoringModule {}
