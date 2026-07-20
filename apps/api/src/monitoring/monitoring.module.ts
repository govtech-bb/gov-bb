import { Module } from "@nestjs/common";
import { MonitoringController } from "./monitoring.controller";
import { NotificationLogRepository } from "@/forms/submissions/notification-log.repository";

/**
 * Internal monitoring endpoints for the observability console. Provides its own
 * NotificationLogRepository instance (a thin, stateless TypeORM repository over
 * the global DataSource), so it stays decoupled from SubmissionsModule.
 */
@Module({
  controllers: [MonitoringController],
  providers: [NotificationLogRepository],
})
export class MonitoringModule {}
