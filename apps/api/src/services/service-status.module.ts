import { Module } from "@nestjs/common";
import { ServiceStatusController } from "./service-status.controller";
import { ServiceStatusService } from "./service-status.service";
import { ServiceStatusRepository } from "./service-status.repository";
import { ServiceStatusAuditLogRepository } from "./service-status-audit-log.repository";

@Module({
  controllers: [ServiceStatusController],
  providers: [
    ServiceStatusService,
    ServiceStatusRepository,
    ServiceStatusAuditLogRepository,
  ],
  exports: [ServiceStatusService],
})
export class ServiceStatusModule {}
