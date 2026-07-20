import { Injectable } from "@nestjs/common";
import { DataSource } from "typeorm";
import { BaseRepository } from "@/database/base.repository";
import { ServiceStatusAuditLogEntity } from "@/database/entities/service-status-audit-log.entity";

@Injectable()
export class ServiceStatusAuditLogRepository extends BaseRepository<ServiceStatusAuditLogEntity> {
  constructor(dataSource: DataSource) {
    super(ServiceStatusAuditLogEntity, dataSource.createEntityManager());
  }

  /** Audit rows for a slug, newest change first. */
  findBySlug(slug: string): Promise<ServiceStatusAuditLogEntity[]> {
    return this.find({ where: { slug }, order: { changedAt: "DESC" } });
  }
}
