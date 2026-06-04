import { Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { DataSource } from "typeorm";
import { PaymentRepository } from "./payment.repository";
import { PaymentWebhookService } from "./payment-webhook.service";

export const RECONCILIATION_LOCK_KEY = 91337;

@Injectable()
export class PaymentReconciliationService {
  private readonly logger = new Logger(PaymentReconciliationService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly paymentRepo: PaymentRepository,
    private readonly webhook: PaymentWebhookService,
  ) {}

  @Cron(CronExpression.EVERY_5_MINUTES)
  async scheduled(): Promise<void> {
    try {
      await this.runOnce();
    } catch (err) {
      this.logger.error("Reconciliation run failed", err);
    }
  }

  /**
   * Re-checks every non-terminal payment with EzPay and converges its status —
   * the safety net for missed webhooks.
   *
   * We do NOT call EzPay's `/transactions_api`: from the whitelisted egress it
   * 302-redirects to `/login` regardless of API key — it is a session-gated
   * dashboard page, not a usable API. Instead we take our own pending /
   * initiated payments and replay each through the webhook entry point, which
   * re-verifies the payment with EzPay via `/check_api` (by reference) and
   * updates status + fires downstream on success. `handleEzpayCallback` trusts
   * check_api, not the synthetic body we pass, so a still-unpaid payment (no
   * transaction linked yet) is left untouched.
   */
  async runOnce(): Promise<{ skipped: boolean; processed: number }> {
    // Postgres advisory locks are session-scoped. dataSource.query() borrows
    // a pool connection per call, so the unlock would land on a different
    // session from the lock. Pin one QueryRunner for the whole run.
    const runner = this.dataSource.createQueryRunner();
    await runner.connect();
    try {
      const [{ pg_try_advisory_lock: locked }] = await runner.query(
        `SELECT pg_try_advisory_lock($1)`,
        [RECONCILIATION_LOCK_KEY],
      );
      if (!locked) {
        return { skipped: true, processed: 0 };
      }

      let processed = 0;
      try {
        const pending = await this.paymentRepo.findReconcilable();
        for (const payment of pending) {
          try {
            await this.webhook.handleEzpayCallback({
              _reference: payment.referenceNumber,
              // Ignored by the handler — it re-verifies via check_api and
              // trusts that, not these fields.
              _status: "Initiated",
              _transaction_number: "",
              _amount: payment.expectedAmount,
            });
            processed++;
          } catch (err) {
            // One un-verifiable payment must not abort the batch.
            this.logger.warn(
              `Reconciliation: could not verify payment ${payment.referenceNumber}`,
              err,
            );
          }
        }
        return { skipped: false, processed };
      } finally {
        await runner.query(`SELECT pg_advisory_unlock($1)`, [
          RECONCILIATION_LOCK_KEY,
        ]);
      }
    } finally {
      await runner.release();
    }
  }
}
