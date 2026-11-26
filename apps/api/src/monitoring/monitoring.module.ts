import { Module } from "@nestjs/common";
import { MonitoringController } from "./monitoring.controller";
import { Mission6Service } from "./mission6.service";
import { NotificationLogRepository } from "@/forms/submissions/notification-log.repository";
import { FormDefinitionsModule } from "@/forms/form-definitions/form-definitions.module";
import { WebhookDestinationsModule } from "@/forms/webhook-destinations/webhook-destinations.module";

/**
 * Internal monitoring endpoints for the observability console. Provides its own
 * NotificationLogRepository instance (a thin, stateless TypeORM repository over
 * the global DataSource), so it stays decoupled from SubmissionsModule.
 * Imports WebhookDestinationsModule to surface the per-MDA destinations audit,
 * and FormDefinitionsModule for the form titles on the Mission 6 figures.
 */
@Module({
  imports: [WebhookDestinationsModule, FormDefinitionsModule],
  controllers: [MonitoringController],
  providers: [NotificationLogRepository, Mission6Service],
})
export class MonitoringModule {}
