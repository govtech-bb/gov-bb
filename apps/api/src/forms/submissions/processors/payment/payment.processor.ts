import { Injectable, Logger } from "@nestjs/common";
import type {
  Processor,
  ResolvedPaymentProcessorConfig,
} from "@govtech-bb/form-types";
import type {
  ISubmissionProcessor,
  ProcessorOutput,
} from "../submission-processor.interface";
import type { SubmissionCreatedEvent } from "../../submissions.types";
import { EzpayClient } from "./ezpay/ezpay.client";
import { DepartmentKeyResolver } from "./ezpay/department-keys";
import { PaymentRepository } from "../../../../payments/payment.repository";
import { generatePaymentReference } from "../../../../payments/payment-reference";
import {
  PaymentProvider,
  PaymentStatus,
} from "../../../../database/entities/payment.entity";

@Injectable()
export class PaymentProcessor implements ISubmissionProcessor {
  readonly type = "payment" as const;
  readonly gatesPipeline = true;
  private readonly logger = new Logger(PaymentProcessor.name);

  constructor(
    private readonly ezpay: EzpayClient,
    private readonly deptKeys: DepartmentKeyResolver,
    private readonly paymentRepo: PaymentRepository,
  ) {}

  async process(payload: SubmissionCreatedEvent): Promise<ProcessorOutput> {
    const cfg = this.extractConfig(payload.processors);

    if (
      typeof cfg.amount !== "number" ||
      !Number.isFinite(cfg.amount) ||
      cfg.amount < 0
    ) {
      throw new Error(
        `PaymentProcessor: amount must be a non-negative number, got ${JSON.stringify(cfg.amount)}`,
      );
    }

    const customerEmail = readPath(payload.values, cfg.customerEmailPath);
    const customerName = readPath(payload.values, cfg.customerNamePath);
    if (!customerEmail) {
      throw new Error(
        `PaymentProcessor: customerEmailPath "${cfg.customerEmailPath}" not found in values`,
      );
    }
    if (!customerName) {
      throw new Error(
        `PaymentProcessor: customerNamePath "${cfg.customerNamePath}" not found in values`,
      );
    }

    const draft = this.paymentRepo.create({
      referenceNumber: generatePaymentReference(),
      submissionId: payload.submissionId,
      formId: payload.formId,
      provider: PaymentProvider.EZPAY,
      department: cfg.department,
      paymentCode: cfg.paymentCode,
      expectedAmount: cfg.amount.toFixed(2),
      description: cfg.description,
      providerToken: null,
      providerUrl: null,
      status: PaymentStatus.PENDING,
    });

    const payment = await this.paymentRepo.findOrCreate(draft);

    if (payment.providerUrl) {
      this.logger.log(
        `Payment ${payment.id} already has provider URL — returning cached URL`,
      );
      return {
        kind: "deferred",
        data: {
          paymentUrl: payment.providerUrl,
          paymentId: payment.id,
          amount: Number(payment.expectedAmount),
          description: payment.description,
        },
      };
    }

    const apiKey = this.deptKeys.get(cfg.department);
    const { token, url } = await this.ezpay.createPayment(
      {
        paymentCode: cfg.paymentCode,
        amount: cfg.amount,
        description: cfg.description,
        reference: payment.referenceNumber,
        customerEmail,
        customerName,
        allowCredit: cfg.allowCredit,
        allowDebit: cfg.allowDebit,
        allowPayce: cfg.allowPayce,
      },
      apiKey,
    );

    payment.providerToken = token;
    payment.providerUrl = url;
    payment.status = PaymentStatus.INITIATED;
    await this.paymentRepo.save(payment);

    this.logger.log(`Payment ${payment.id} initiated with EzPay`);

    return {
      kind: "deferred",
      data: {
        paymentUrl: url,
        paymentId: payment.id,
        amount: cfg.amount,
        description: cfg.description,
      },
    };
  }

  private extractConfig(
    processors: Processor[],
  ): ResolvedPaymentProcessorConfig {
    const p = processors.find(isPaymentProcessor);
    if (!p) {
      throw new Error("PaymentProcessor: no payment config in processors[]");
    }
    // ExpressionsService.resolveProcessors validates against
    // resolvedProcessorSchema before dispatch, so this cast is sound.
    return p.config as ResolvedPaymentProcessorConfig;
  }
}

function isPaymentProcessor(
  p: Processor,
): p is Extract<Processor, { type: "payment" }> {
  return p.type === "payment";
}

function readPath(obj: unknown, path: string): string | undefined {
  const result = path
    .split(".")
    .reduce<unknown>(
      (acc, k) =>
        acc && typeof acc === "object"
          ? (acc as Record<string, unknown>)[k]
          : undefined,
      obj,
    );
  return typeof result === "string" ? result : undefined;
}
