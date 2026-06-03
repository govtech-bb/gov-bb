import { Injectable } from "@nestjs/common";
import { DataSource, In, MoreThanOrEqual, Repository } from "typeorm";
import {
  PaymentEntity,
  PaymentStatus,
} from "../database/entities/payment.entity";

/**
 * How far back the reconciliation cron re-checks non-terminal payments.
 * Payments older than this that are still PENDING/INITIATED are dropped from
 * the re-check set. Without this bound the working set grows without limit as
 * abandoned payments accumulate, and each run makes one sequential EzPay
 * `/check_api` call per payment — eventually overrunning the 5-minute cron
 * interval.
 *
 * Kept in step with AbandonedPaymentCleanupService's 72h TTL (the point at
 * which a still-pending payment is CANCELLED → terminal → naturally excluded
 * here). Matching the two means a payment is reconciled for its entire
 * non-terminal life with no gap: anything younger is actively re-checked,
 * anything older is on its way to being cancelled. If the cleanup TTL changes,
 * change this with it.
 */
export const RECONCILIATION_MAX_AGE_HOURS = 72;

@Injectable()
export class PaymentRepository {
  private readonly repo: Repository<PaymentEntity>;
  constructor(dataSource: DataSource) {
    this.repo = dataSource.getRepository(PaymentEntity);
  }

  create(draft: Partial<PaymentEntity>): PaymentEntity {
    return this.repo.create(draft);
  }

  async findOrCreate(draft: PaymentEntity): Promise<PaymentEntity> {
    const existing = await this.repo.findOne({
      where: { submissionId: draft.submissionId },
    });
    if (existing) return existing;
    return this.repo.save(draft);
  }

  findByReference(referenceNumber: string): Promise<PaymentEntity | null> {
    return this.repo.findOne({ where: { referenceNumber } });
  }

  /**
   * Non-terminal payments that reconciliation should re-check with EzPay.
   * PENDING (created, citizen may still be paying) and INITIATED (provider
   * token issued) can still converge to success/failure; SUCCESS / FAILED /
   * CANCELLED / MISMATCHED / REFUNDED are terminal and left alone.
   *
   * Bounded to payments created within RECONCILIATION_MAX_AGE_HOURS so the
   * re-check set (and the per-run EzPay fan-out) stays small as abandoned
   * payments pile up — see the constant's doc comment.
   */
  findReconcilable(): Promise<PaymentEntity[]> {
    const cutoff = new Date(
      Date.now() - RECONCILIATION_MAX_AGE_HOURS * 60 * 60 * 1000,
    );
    return this.repo.find({
      where: {
        status: In([PaymentStatus.PENDING, PaymentStatus.INITIATED]),
        createdAt: MoreThanOrEqual(cutoff),
      },
    });
  }

  save(p: PaymentEntity): Promise<PaymentEntity> {
    return this.repo.save(p);
  }
}
