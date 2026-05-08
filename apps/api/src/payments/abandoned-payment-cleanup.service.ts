import { Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { DataSource, In, LessThan } from "typeorm";
import {
  PaymentEntity,
  PaymentStatus,
} from "../database/entities/payment.entity";

const DEFAULT_TTL_HOURS = 72;

@Injectable()
export class AbandonedPaymentCleanupService {
  private readonly logger = new Logger(AbandonedPaymentCleanupService.name);

  constructor(private readonly dataSource: DataSource) {}

  @Cron(CronExpression.EVERY_DAY_AT_2AM)
  async scheduled(): Promise<void> {
    try {
      await this.runOnce({ ttlHours: DEFAULT_TTL_HOURS });
    } catch (err) {
      this.logger.error("Abandoned payment cleanup failed", err);
    }
  }

  async runOnce({
    ttlHours,
  }: {
    ttlHours: number;
  }): Promise<{ cancelled: number }> {
    const cutoff = new Date(Date.now() - ttlHours * 60 * 60 * 1000);
    const repo = this.dataSource.getRepository(PaymentEntity);

    const stale = await repo.find({
      where: {
        status: In([PaymentStatus.PENDING, PaymentStatus.INITIATED]),
        createdAt: LessThan(cutoff),
      },
    });
    if (stale.length === 0) return { cancelled: 0 };

    for (const p of stale) p.status = PaymentStatus.CANCELLED;
    await repo.save(stale);

    this.logger.log(
      `Cancelled ${stale.length} abandoned payment(s) older than ${ttlHours}h`,
    );
    return { cancelled: stale.length };
  }
}
