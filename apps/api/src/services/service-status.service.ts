import { Injectable } from "@nestjs/common";
import { ServiceStatus } from "@/database/entities/service-status.entity";
import { ServiceStatusRepository } from "./service-status.repository";
import { ServiceStatusAuditLogRepository } from "./service-status-audit-log.repository";

/** Minimal public view of a service's status. */
export interface ServiceStatusView {
  formId: string;
  status: ServiceStatus;
}

@Injectable()
export class ServiceStatusService {
  constructor(
    private readonly statusRepo: ServiceStatusRepository,
    private readonly auditRepo: ServiceStatusAuditLogRepository,
  ) {}

  /** Every service's current status, as `{ formId, status }`. */
  async list(): Promise<ServiceStatusView[]> {
    const rows = await this.statusRepo.find();
    return rows.map((row) => ({ formId: row.formId, status: row.status }));
  }

  /**
   * Set a service's status and record the change. Runs in one transaction:
   * upsert the current-state row and append an audit row. A form with no row
   * yet is created (first entry has `oldState = null`). Setting the same status
   * is an idempotent no-op — nothing is written and no audit row is added.
   */
  async setStatus(
    formId: string,
    status: ServiceStatus,
    author: string,
  ): Promise<ServiceStatusView> {
    await this.statusRepo.tx(async (statusRepo) => {
      const auditRepo = statusRepo.withRepo(this.auditRepo);
      const existing = await statusRepo.findOne({ where: { formId } });
      const oldState = existing?.status ?? null;

      if (oldState === status) return;

      if (existing) {
        existing.status = status;
        await statusRepo.save(existing);
      } else {
        await statusRepo.save(statusRepo.create({ formId, status }));
      }

      await auditRepo.save(
        auditRepo.create({ formId, oldState, newState: status, author }),
      );
    });

    return { formId, status };
  }
}
