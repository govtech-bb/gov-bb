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

  async handleEzpayCallback(
    body: EzpayCallbackBody,
  ): Promise<{ acknowledged: boolean }> {
    const payment = await this.paymentRepo.findByReference(body._reference);
    if (!payment) {
      this.logger.warn(`Payment not found for reference ${body._reference}`);
      return { acknowledged: true };
    }

    const apiKey = this.deptKeys.get(payment.department);
    const verified = await this.ezpay.verifyPayment(
      {
        transactionNumber: body._transaction_number,
        reference: body._reference,
      },
      apiKey,
    );

    await this.upsertTransaction(payment.id, verified);

    if (verified.status !== "Success") {
      if (verified.status === "Failed") {
        payment.status = PaymentStatus.FAILED;
        await this.paymentRepo.save(payment);
      }
      return { acknowledged: true };
    }

    if (!this.amountsMatch(verified.amount, payment.expectedAmount)) {
      this.logger.error(
        `Amount mismatch on payment ${payment.id}: expected=${payment.expectedAmount} got=${verified.amount}`,
      );
      payment.status = PaymentStatus.MISMATCHED;
      await this.paymentRepo.save(payment);
      return { acknowledged: true };
    }

    payment.status = PaymentStatus.SUCCESS;
    await this.paymentRepo.save(payment);

    await this.fireDownstream(payment);
    return { acknowledged: true };
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
