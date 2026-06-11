import { Injectable, Logger } from "@nestjs/common";
import { DataSource, Repository } from "typeorm";
import { EventEmitter2 } from "@nestjs/event-emitter";
import { PaymentRepository } from "./payment.repository";
import { EzpayClient } from "../forms/submissions/processors/payment/ezpay/ezpay.client";
import { DepartmentKeyResolver } from "../forms/submissions/processors/payment/ezpay/department-keys";
import {
  PaymentTransactionEntity,
  PaymentTransactionStatus,
} from "../database/entities/payment-transaction.entity";
import {
  PaymentEntity,
  PaymentStatus,
} from "../database/entities/payment.entity";
import {
  FormSubmissionEntity,
  FormSubmissionStatus,
} from "../database/entities/form-submission.entity";
import { FormDefinitionsService } from "../forms/form-definitions/form-definitions.service";
import type { SubmissionCreatedEvent } from "../forms/submissions/submissions.types";
import type { VerifyPaymentResult } from "../forms/submissions/processors/payment/ezpay/ezpay.types";

export interface EzpayCallbackBody {
  _reference: string;
  _status: "Success" | "Failed" | "Initiated";
  _transaction_number: string;
  _amount: string;
  _processor?: string;
  _datesettled?: string;
  _ezpay_account?: string;
  _pcode?: string;
}

/**
 * Result of verifying a payment, shared by the server-to-server webhook and the
 * browser return redirect.
 * - `success`   — verified Success with a matching amount; submission finalised.
 * - `failed`    — verified Failed, or a Success whose amount didn't match.
 * - `pending`   — not yet terminal (e.g. Initiated, or no transaction found).
 * - `not_found` — no local payment matched the reference.
 */
export type PaymentConfirmationOutcome =
  | "success"
  | "failed"
  | "pending"
  | "not_found";

export interface PaymentReturnResult {
  outcome: PaymentConfirmationOutcome;
  /** The form the payment belongs to, for building the confirmation redirect. */
  formId?: string;
}

@Injectable()
export class PaymentWebhookService {
  private readonly logger = new Logger(PaymentWebhookService.name);

  constructor(
    private readonly ezpay: EzpayClient,
    private readonly paymentRepo: PaymentRepository,
    private readonly deptKeys: DepartmentKeyResolver,
    private readonly dataSource: DataSource,
    private readonly events: EventEmitter2,
    private readonly formDefs: FormDefinitionsService,
  ) {}

  /**
   * Server-to-server EzPay webhook (push). Always returns `{ acknowledged }`
   * regardless of outcome so EzPay doesn't enter a retry storm.
   */
  async handleEzpayCallback(
    body: EzpayCallbackBody,
  ): Promise<{ acknowledged: boolean }> {
    await this.confirmPayment(body._reference, body._transaction_number);
    return { acknowledged: true };
  }

  /**
   * Confirm a payment from EzPay's post-payment **return redirect** (the
   * citizen's browser, carrying `rid`/`tx`). Shares the same verify-and-finalise
   * core as the webhook, so a return redirect alone is enough to confirm a
   * payment, fire downstream processors and send emails — even when the webhook
   * URL isn't configured on the merchant. Idempotent: if the webhook already
   * finalised the submission, `fireDownstream` is a no-op. Returns the outcome
   * and the `formId` so the caller can build the confirmation redirect.
   */
  async confirmReturn(args: {
    reference: string;
    transactionNumber?: string;
  }): Promise<PaymentReturnResult> {
    const { payment, outcome } = await this.confirmPayment(
      args.reference,
      args.transactionNumber,
    );
    return { outcome, formId: payment?.formId };
  }

  /**
   * Verify a payment with EzPay and apply the resulting status transition +
   * downstream emit. The single source of truth for "did this payment succeed",
   * reused by both the webhook and the return redirect. Authoritative data comes
   * from `verifyPayment` (EzPay `check_api`), not the caller-supplied status, so
   * the two entry points can't disagree.
   */
  private async confirmPayment(
    reference: string,
    transactionNumber: string | undefined,
  ): Promise<{
    payment: PaymentEntity | null;
    outcome: PaymentConfirmationOutcome;
  }> {
    const payment = await this.paymentRepo.findByReference(reference);
    if (!payment) {
      this.logger.warn(`Payment not found for reference ${reference}`);
      return { payment: null, outcome: "not_found" };
    }

    const apiKey = this.deptKeys.get(payment.department);
    const verified = await this.ezpay.verifyPayment(
      { transactionNumber, reference },
      apiKey,
    );

    await this.upsertTransaction(payment.id, verified);

    if (verified.status !== "Success") {
      if (verified.status === "Failed") {
        payment.status = PaymentStatus.FAILED;
        await this.paymentRepo.save(payment);
        return { payment, outcome: "failed" };
      }
      return { payment, outcome: "pending" };
    }

    if (!this.amountsMatch(verified.amount, payment.expectedAmount)) {
      this.logger.error(
        `Amount mismatch on payment ${payment.id}: expected=${payment.expectedAmount} got=${verified.amount}`,
      );
      payment.status = PaymentStatus.MISMATCHED;
      await this.paymentRepo.save(payment);
      return { payment, outcome: "failed" };
    }

    payment.status = PaymentStatus.SUCCESS;
    await this.paymentRepo.save(payment);

    await this.fireDownstream(payment);
    return { payment, outcome: "success" };
  }

  // expectedAmount is decimal(10,2) stored as string ("50.00"); verifiedAmount
  // is parsed as a number. The 0.005 epsilon (half a cent) avoids spurious
  // mismatches from float imprecision on cent-precision currency.
  private amountsMatch(
    verifiedAmount: number,
    expectedAmount: string,
  ): boolean {
    return Math.abs(verifiedAmount - Number(expectedAmount)) < 0.005;
  }

  private async upsertTransaction(
    paymentId: string,
    v: VerifyPaymentResult,
  ): Promise<void> {
    // No transaction number means EzPay has no transaction linked to this
    // reference yet — typically a still-unpaid payment surfaced by the
    // reconciliation cron, which replays every PENDING payment by reference.
    // There is nothing to record, and persisting it would be actively harmful:
    // findOne({ where: { transactionNumber: undefined } }) drops the condition
    // and matches an arbitrary row (which we'd then overwrite), while an empty
    // string collides on the transaction_number unique index across every
    // unpaid payment. Skip — the payment stays non-terminal and gets re-checked
    // next cycle.
    if (!v.transactionNumber) {
      this.logger.debug(
        `[payment] No transaction number on verified result for payment ${paymentId} (status=${v.status ?? "unknown"}) — skipping transaction upsert`,
      );
      return;
    }
    const repo: Repository<PaymentTransactionEntity> =
      this.dataSource.getRepository(PaymentTransactionEntity);
    const existing = await repo.findOne({
      where: { transactionNumber: v.transactionNumber },
    });
    const fields = {
      paymentId,
      transactionNumber: v.transactionNumber,
      processor: v.processor,
      status: this.mapTxStatus(v.status),
      amount: String(v.amount),
      dateSettled: v.dateSettled ? new Date(v.dateSettled) : null,
      rawResponse: { ...v },
    };
    if (existing) {
      Object.assign(existing, fields);
      await repo.save(existing);
    } else {
      await repo.save(repo.create(fields));
    }
  }

  private mapTxStatus(
    s: VerifyPaymentResult["status"],
  ): PaymentTransactionStatus {
    if (s === "Success") return PaymentTransactionStatus.SUCCESS;
    if (s === "Failed") return PaymentTransactionStatus.FAILED;
    return PaymentTransactionStatus.INITIATED;
  }

  private async fireDownstream(payment: PaymentEntity): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const submissionRepo = manager.getRepository(FormSubmissionEntity);
      const submission = await submissionRepo.findOne({
        where: { id: payment.submissionId },
        lock: { mode: "pessimistic_write" },
      });
      if (!submission) {
        this.logger.warn(`Submission not found for payment ${payment.id}`);
        return;
      }
      if (submission.status !== FormSubmissionStatus.PENDING_PAYMENT) {
        this.logger.log(
          `Submission ${submission.id} already transitioned (${submission.status}) — skipping emit`,
        );
        return;
      }

      const contract = await this.formDefs.findByFormId({
        formId: payment.formId,
        version: submission.formVersion,
        includeProcessors: true,
      });
      const downstreamProcessors = (contract.processors ?? []).filter(
        (p) => p.type !== "payment",
      );

      submission.status = FormSubmissionStatus.SUBMITTED;
      submission.submittedAt = new Date();
      await submissionRepo.save(submission);

      const event: SubmissionCreatedEvent = {
        submissionId: submission.id,
        referenceCode: submission.referenceCode,
        formId: submission.formId,
        formVersion: submission.formVersion,
        idempotencyKey: submission.idempotencyKey,
        processors: downstreamProcessors,
        values: submission.values as SubmissionCreatedEvent["values"],
        meta: submission.meta as unknown as SubmissionCreatedEvent["meta"],
      };
      this.events.emit("submission.created", event);
    });
  }
}
