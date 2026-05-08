import { Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { DataSource } from "typeorm";
import { EzpayClient } from "../forms/submissions/processors/payment/ezpay/ezpay.client";
import { DepartmentKeyResolver } from "../forms/submissions/processors/payment/ezpay/department-keys";
import { PaymentRepository } from "./payment.repository";
import {
  PaymentWebhookService,
  type EzpayCallbackBody,
} from "./payment-webhook.service";
import { PaymentStatus } from "../database/entities/payment.entity";

export const RECONCILIATION_LOCK_KEY = 91337;
const WINDOW_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class PaymentReconciliationService {
  private readonly logger = new Logger(PaymentReconciliationService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly ezpay: EzpayClient,
    private readonly paymentRepo: PaymentRepository,
    private readonly webhook: PaymentWebhookService,
    private readonly deptKeys: DepartmentKeyResolver,
  ) {}

  @Cron(CronExpression.EVERY_5_MINUTES)
  async scheduled(): Promise<void> {
    try {
      await this.runOnce();
    } catch (err) {
      this.logger.error("Reconciliation run failed", err);
    }
  }

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
        const [start, end] = rollingWindow();
        for (const dept of this.deptKeys.departments()) {
          const apiKey = this.deptKeys.get(dept);
          const txs = await this.ezpay.queryTransactions(start, end, apiKey);
          for (const tx of txs) {
            const payment = await this.paymentRepo.findByReference(
              tx.reference,
            );
            if (!payment) continue;
            if (alreadyConverged(payment.status, tx.status)) continue;
            const body: EzpayCallbackBody = {
              _reference: tx.reference,
              _status: tx.status,
              _transaction_number: tx.transactionNumber,
              _amount: String(tx.amount),
            };
            await this.webhook.handleEzpayCallback(body);
            processed++;
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

function alreadyConverged(
  local: PaymentStatus,
  remote: "Success" | "Failed" | "Initiated",
): boolean {
  if (local === PaymentStatus.SUCCESS && remote === "Success") return true;
  if (local === PaymentStatus.FAILED && remote === "Failed") return true;
  return false;
}

function rollingWindow(): [string, string] {
  const now = new Date();
  const start = new Date(now.getTime() - WINDOW_MS);
  return [fmt(start), fmt(now)];
}

// Format: "YYYY-MM-DD HH:mm" UTC. Switch to America/Barbados via luxon if
// EzPay rejects this input.
function fmt(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}` +
    ` ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`
  );
}
