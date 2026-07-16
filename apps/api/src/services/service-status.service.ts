import { Injectable } from "@nestjs/common";
import { ServiceStatus } from "@/database/entities/service-status.entity";
import { ServiceStatusRepository } from "./service-status.repository";
import { ServiceStatusAuditLogRepository } from "./service-status-audit-log.repository";

/** Minimal public view of a service's status. */
export interface ServiceStatusView {
  slug: string;
  status: ServiceStatus;
}

/**
 * Result of a status update — carries the prior status so callers can detect an
 * actual change (and word a "from → to" message). `null` when the service had
 * no row yet; equal to `status` when the update was an idempotent no-op.
 */
export interface ServiceStatusUpdateView extends ServiceStatusView {
  previousStatus: ServiceStatus | null;
}

/** A single audit-log entry for a service's status change. */
export interface ServiceStatusAuditView {
  slug: string;
  oldState: ServiceStatus | null;
  newState: ServiceStatus;
  author: string;
  changedAt: Date;
}

@Injectable()
export class ServiceStatusService {
  constructor(
    private readonly statusRepo: ServiceStatusRepository,
    private readonly auditRepo: ServiceStatusAuditLogRepository,
  ) {}

  /** Every service's current status, as `{ slug, status }`. */
  async list(): Promise<ServiceStatusView[]> {
    const rows = await this.statusRepo.find();
    return rows.map((row) => ({ slug: row.slug, status: row.status }));
  }

  /** A single service's current status, or null when it has no row (seed/default applies). */
  async getStatus(slug: string): Promise<ServiceStatus | null> {
    const row = await this.statusRepo.findOne({ where: { slug } });
    return row?.status ?? null;
  }

  /** A service's status-change history, newest first. */
  async getAuditForSlug(slug: string): Promise<ServiceStatusAuditView[]> {
    const rows = await this.auditRepo.findBySlug(slug);
    return rows.map((row) => ({
      slug: row.slug,
      oldState: row.oldState,
      newState: row.newState,
      author: row.author,
      changedAt: row.changedAt,
    }));
  }

  /**
   * Set a service's status and record the change. Runs in one transaction:
   * upsert the current-state row and append an audit row. A service with no row
   * yet is created (first entry has `oldState = null`). Setting the same status
   * is an idempotent no-op — nothing is written and no audit row is added.
   */
  async setStatus(
    slug: string,
    status: ServiceStatus,
    author: string,
  ): Promise<ServiceStatusUpdateView> {
    let previousStatus: ServiceStatus | null = null;
    await this.statusRepo.tx(async (statusRepo) => {
      const auditRepo = statusRepo.withRepo(this.auditRepo);
      const existing = await statusRepo.findOne({ where: { slug } });
      const oldState = existing?.status ?? null;
      previousStatus = oldState;

      if (oldState === status) return;

      if (existing) {
        existing.status = status;
        await statusRepo.save(existing);
      } else {
        await statusRepo.save(statusRepo.create({ slug, status }));
      }

      await auditRepo.save(
        auditRepo.create({ slug, oldState, newState: status, author }),
      );
    });

    return { slug, status, previousStatus };
  }
}
