import { Test, TestingModule } from "@nestjs/testing";
import { DataSource } from "typeorm";
import { EventEmitter2 } from "@nestjs/event-emitter";
import { PaymentWebhookService } from "./payment-webhook.service";
import { PaymentRepository } from "./payment.repository";
import { EzpayClient } from "../forms/submissions/processors/payment/ezpay/ezpay.client";
import { DepartmentKeyResolver } from "../forms/submissions/processors/payment/ezpay/department-keys";
import { FormDefinitionsService } from "../forms/form-definitions/form-definitions.service";
import {
  PaymentEntity,
  PaymentStatus,
  PaymentProvider,
} from "../database/entities/payment.entity";
import {
  PaymentTransactionEntity,
  PaymentTransactionStatus,
} from "../database/entities/payment-transaction.entity";
import {
  FormSubmissionEntity,
  FormSubmissionStatus,
} from "../database/entities/form-submission.entity";
import type { VerifyPaymentResult } from "../forms/submissions/processors/payment/ezpay/ezpay.types";

function makePayment(overrides: Partial<PaymentEntity> = {}): PaymentEntity {
  return Object.assign(new PaymentEntity(), {
    id: "pay-1",
    referenceNumber: "ref-1",
    submissionId: "sub-1",
    formId: "passport-renewal",
    provider: PaymentProvider.EZPAY,
    department: "immigration",
    paymentCode: "PCODE",
    expectedAmount: "50.00",
    description: "Passport",
    providerToken: "tok",
    providerUrl: "https://ezpay/test",
    status: PaymentStatus.INITIATED,
    ...overrides,
  });
}

function makeSubmission(
  overrides: Partial<FormSubmissionEntity> = {},
): FormSubmissionEntity {
  return Object.assign(new FormSubmissionEntity(), {
    id: "sub-1",
    idempotencyKey: "idem-1",
    formId: "passport-renewal",
    formVersion: "1.0.0",
    status: FormSubmissionStatus.PENDING_PAYMENT,
    values: { step1: { name: "Jane" } },
    meta: { schemaVersion: 1, pinnedFormVersion: "1.0.0" },
    submittedAt: null,
    ...overrides,
  });
}

function makeVerified(
  overrides: Partial<VerifyPaymentResult> = {},
): VerifyPaymentResult {
  return {
    status: "Success",
    transactionNumber: "TXN-1",
    amount: 50.0,
    processor: "Visa",
    dateSettled: "2026-05-04T10:00:00Z",
    account: "acct-1",
    ...overrides,
  };
}

describe("PaymentWebhookService", () => {
  let service: PaymentWebhookService;
  let module: TestingModule;

  const ezpay = { verifyPayment: vi.fn() };
  const paymentRepo = { findByReference: vi.fn(), save: vi.fn() };
  const deptKeys = { get: vi.fn().mockReturnValue("api-key") };
  const formDefs = { findByFormId: vi.fn() };
  const events = { emit: vi.fn() };

  const submissionRepo = { findOne: vi.fn(), save: vi.fn() };
  const txRepo = {
    findOne: vi.fn(),
    save: vi.fn(),
    create: vi.fn().mockImplementation((d) => d),
  };
  const dataSource = {
    getRepository: vi.fn((entity: unknown) => {
      if (entity === PaymentTransactionEntity) return txRepo;
      if (entity === FormSubmissionEntity) return submissionRepo;
      throw new Error(`Unexpected entity in test: ${String(entity)}`);
    }),
    transaction: vi.fn(async (cb: (mgr: unknown) => Promise<unknown>) => {
      return cb({
        getRepository: (entity: unknown) => {
          if (entity === FormSubmissionEntity) return submissionRepo;
          throw new Error(
            `Unexpected entity inside transaction: ${String(entity)}`,
          );
        },
      });
    }),
  } as unknown as DataSource;

  beforeEach(async () => {
    vi.clearAllMocks();
    txRepo.create.mockImplementation((d) => d);
    deptKeys.get.mockReturnValue("api-key");

    module = await Test.createTestingModule({
      providers: [
        PaymentWebhookService,
        { provide: EzpayClient, useValue: ezpay },
        { provide: PaymentRepository, useValue: paymentRepo },
        { provide: DepartmentKeyResolver, useValue: deptKeys },
        { provide: DataSource, useValue: dataSource },
        { provide: EventEmitter2, useValue: events },
        { provide: FormDefinitionsService, useValue: formDefs },
      ],
    }).compile();
    service = module.get(PaymentWebhookService);
  });

  afterEach(async () => {
    if (module) await module.close();
  });

  const callbackBody = {
    _reference: "ref-1",
    _status: "Success" as const,
    _transaction_number: "TXN-1",
    _amount: "50.00",
  };

  it("on Success + matching amount: marks payment SUCCESS, transitions submission, emits without payment processor", async () => {
    const payment = makePayment();
    const submission = makeSubmission();
    paymentRepo.findByReference.mockResolvedValue(payment);
    ezpay.verifyPayment.mockResolvedValue(makeVerified());
    txRepo.findOne.mockResolvedValue(null);
    txRepo.save.mockImplementation(async (e) => e);
    paymentRepo.save.mockImplementation(async (e) => e);
    submissionRepo.findOne.mockResolvedValue(submission);
    submissionRepo.save.mockImplementation(async (e) => e);
    formDefs.findByFormId.mockResolvedValue({
      processors: [
        { type: "payment", config: {} },
        { type: "email", config: { to: "x@y" } },
        { type: "spreadsheet", config: {} },
      ],
    });

    const result = await service.handleEzpayCallback(callbackBody);

    expect(result).toEqual({ acknowledged: true });
    expect(ezpay.verifyPayment).toHaveBeenCalledWith(
      { transactionNumber: "TXN-1", reference: "ref-1" },
      "api-key",
    );
    expect(formDefs.findByFormId).toHaveBeenCalledWith({
      formId: "passport-renewal",
      version: "1.0.0",
      includeProcessors: true,
    });
    expect(payment.status).toBe(PaymentStatus.SUCCESS);
    expect(paymentRepo.save).toHaveBeenCalledWith(payment);

    expect(submission.status).toBe(FormSubmissionStatus.SUBMITTED);
    expect(submission.submittedAt).toBeInstanceOf(Date);
    expect(submissionRepo.save).toHaveBeenCalledWith(submission);
    expect(submissionRepo.findOne).toHaveBeenCalledWith({
      where: { id: "sub-1" },
      lock: { mode: "pessimistic_write" },
    });

    expect(txRepo.save).toHaveBeenCalledTimes(1);
    const txArg = txRepo.save.mock.calls[0][0];
    expect(txArg.paymentId).toBe("pay-1");
    expect(txArg.transactionNumber).toBe("TXN-1");
    expect(txArg.status).toBe(PaymentTransactionStatus.SUCCESS);
    expect(txArg.amount).toBe("50");
    expect(txArg.dateSettled).toBeInstanceOf(Date);

    expect(events.emit).toHaveBeenCalledTimes(1);
    const [eventName, payload] = events.emit.mock.calls[0];
    expect(eventName).toBe("submission.created");
    expect(payload.submissionId).toBe("sub-1");
    expect(payload.idempotencyKey).toBe("idem-1");
    expect(payload.processors).toEqual([
      { type: "email", config: { to: "x@y" } },
      { type: "spreadsheet", config: {} },
    ]);
    expect(payload.values).toEqual({ step1: { name: "Jane" } });
  });

  it("on amount mismatch: marks payment MISMATCHED, does NOT emit, does NOT touch submission", async () => {
    const payment = makePayment({ expectedAmount: "75.00" });
    paymentRepo.findByReference.mockResolvedValue(payment);
    ezpay.verifyPayment.mockResolvedValue(makeVerified({ amount: 50.0 }));
    txRepo.findOne.mockResolvedValue(null);
    txRepo.save.mockImplementation(async (e) => e);
    paymentRepo.save.mockImplementation(async (e) => e);

    const result = await service.handleEzpayCallback(callbackBody);

    expect(result).toEqual({ acknowledged: true });
    expect(payment.status).toBe(PaymentStatus.MISMATCHED);
    expect(paymentRepo.save).toHaveBeenCalledWith(payment);
    expect(submissionRepo.findOne).not.toHaveBeenCalled();
    expect(submissionRepo.save).not.toHaveBeenCalled();
    expect(events.emit).not.toHaveBeenCalled();
  });

  it("idempotency: when submission is already SUBMITTED, does not re-emit", async () => {
    const payment = makePayment();
    const submission = makeSubmission({
      status: FormSubmissionStatus.SUBMITTED,
      submittedAt: new Date("2026-05-01T00:00:00Z"),
    });
    paymentRepo.findByReference.mockResolvedValue(payment);
    ezpay.verifyPayment.mockResolvedValue(makeVerified());
    txRepo.findOne.mockResolvedValue(null);
    txRepo.save.mockImplementation(async (e) => e);
    paymentRepo.save.mockImplementation(async (e) => e);
    submissionRepo.findOne.mockResolvedValue(submission);

    await service.handleEzpayCallback(callbackBody);

    expect(events.emit).not.toHaveBeenCalled();
    expect(submissionRepo.save).not.toHaveBeenCalled();
    expect(formDefs.findByFormId).not.toHaveBeenCalled();
  });

  it("payment not found: returns acknowledged with no side effects", async () => {
    paymentRepo.findByReference.mockResolvedValue(null);

    const result = await service.handleEzpayCallback(callbackBody);

    expect(result).toEqual({ acknowledged: true });
    expect(ezpay.verifyPayment).not.toHaveBeenCalled();
    expect(paymentRepo.save).not.toHaveBeenCalled();
    expect(txRepo.save).not.toHaveBeenCalled();
    expect(events.emit).not.toHaveBeenCalled();
  });

  it("on EzPay Failed: marks payment FAILED, does NOT emit", async () => {
    const payment = makePayment();
    paymentRepo.findByReference.mockResolvedValue(payment);
    ezpay.verifyPayment.mockResolvedValue(
      makeVerified({ status: "Failed", amount: 50.0 }),
    );
    txRepo.findOne.mockResolvedValue(null);
    txRepo.save.mockImplementation(async (e) => e);
    paymentRepo.save.mockImplementation(async (e) => e);

    const result = await service.handleEzpayCallback(callbackBody);

    expect(result).toEqual({ acknowledged: true });
    expect(payment.status).toBe(PaymentStatus.FAILED);
    expect(paymentRepo.save).toHaveBeenCalledWith(payment);

    const txArg = txRepo.save.mock.calls[0][0];
    expect(txArg.status).toBe(PaymentTransactionStatus.FAILED);

    expect(submissionRepo.findOne).not.toHaveBeenCalled();
    expect(events.emit).not.toHaveBeenCalled();
  });

  it("submission not found inside transaction: warns and returns without emitting", async () => {
    // Branch: `if (!submission)` inside fireDownstream
    const payment = makePayment();
    paymentRepo.findByReference.mockResolvedValue(payment);
    ezpay.verifyPayment.mockResolvedValue(makeVerified());
    txRepo.findOne.mockResolvedValue(null);
    txRepo.save.mockImplementation(async (e) => e);
    paymentRepo.save.mockImplementation(async (e) => e);
    submissionRepo.findOne.mockResolvedValue(null); // no matching submission

    const result = await service.handleEzpayCallback(callbackBody);

    expect(result).toEqual({ acknowledged: true });
    expect(submissionRepo.save).not.toHaveBeenCalled();
    expect(formDefs.findByFormId).not.toHaveBeenCalled();
    expect(events.emit).not.toHaveBeenCalled();
  });

  it("filters out payment processors from downstream event (processors ?? [] branch)", async () => {
    // Branch: `contract.processors ?? []` when processors is undefined
    const payment = makePayment();
    const submission = makeSubmission();
    paymentRepo.findByReference.mockResolvedValue(payment);
    ezpay.verifyPayment.mockResolvedValue(makeVerified());
    txRepo.findOne.mockResolvedValue(null);
    txRepo.save.mockImplementation(async (e) => e);
    paymentRepo.save.mockImplementation(async (e) => e);
    submissionRepo.findOne.mockResolvedValue(submission);
    submissionRepo.save.mockImplementation(async (e) => e);
    // No processors key — tests the `?? []` fallback
    formDefs.findByFormId.mockResolvedValue({});

    const result = await service.handleEzpayCallback(callbackBody);

    expect(result).toEqual({ acknowledged: true });
    expect(events.emit).toHaveBeenCalledTimes(1);
    const [, payload] = events.emit.mock.calls[0];
    expect(payload.processors).toEqual([]);
  });

  it("on EzPay Initiated: does not mark payment FAILED, does not emit (non-Success, non-Failed)", async () => {
    // Branch: `verified.status !== "Success"` && `verified.status !== "Failed"` (Initiated case)
    // mapTxStatus returns PaymentTransactionStatus.INITIATED
    const payment = makePayment();
    paymentRepo.findByReference.mockResolvedValue(payment);
    ezpay.verifyPayment.mockResolvedValue(
      makeVerified({ status: "Initiated", amount: 50.0 }),
    );
    txRepo.findOne.mockResolvedValue(null);
    txRepo.save.mockImplementation(async (e) => e);
    paymentRepo.save.mockImplementation(async (e) => e);

    const result = await service.handleEzpayCallback(callbackBody);

    expect(result).toEqual({ acknowledged: true });
    // payment status should NOT be changed (only Failed changes it in non-success path)
    expect(paymentRepo.save).not.toHaveBeenCalled();
    expect(events.emit).not.toHaveBeenCalled();

    // transaction was still upserted
    const txArg = txRepo.save.mock.calls[0][0];
    expect(txArg.status).toBe(PaymentTransactionStatus.INITIATED);
  });

  it("on a still-unpaid reference (no transaction number): skips the transaction upsert entirely", async () => {
    // Reconciliation replays every PENDING payment by reference; for one the
    // citizen never paid, check_api returns no transaction number. Persisting
    // it would be unsafe — findOne({ where: { transactionNumber: undefined } })
    // matches an arbitrary row, and "" collides on the unique index across all
    // unpaid payments — so the upsert must be skipped and the payment left
    // non-terminal for the next cycle.
    const payment = makePayment();
    paymentRepo.findByReference.mockResolvedValue(payment);
    ezpay.verifyPayment.mockResolvedValue(
      makeVerified({ status: "Initiated", transactionNumber: "", amount: 0 }),
    );

    const result = await service.handleEzpayCallback(callbackBody);

    expect(result).toEqual({ acknowledged: true });
    expect(txRepo.findOne).not.toHaveBeenCalled();
    expect(txRepo.save).not.toHaveBeenCalled();
    // payment stays non-terminal; nothing emitted
    expect(paymentRepo.save).not.toHaveBeenCalled();
    expect(events.emit).not.toHaveBeenCalled();
  });

  it("merges into existing transaction row when transactionNumber already exists", async () => {
    const existingTx = {
      id: "tx-row-1",
      paymentId: "pay-1",
      transactionNumber: "tx-1",
      status: PaymentTransactionStatus.INITIATED,
      amount: "50",
      processor: "Credit Card",
      dateSettled: null,
      rawResponse: null,
    };
    txRepo.findOne.mockResolvedValue(existingTx);
    paymentRepo.findByReference.mockResolvedValue(makePayment());
    ezpay.verifyPayment.mockResolvedValue({
      status: "Success",
      transactionNumber: "tx-1",
      amount: 50,
      processor: "Credit Card",
      dateSettled: "2026-04-29",
      account: "acct",
    });
    submissionRepo.findOne.mockResolvedValue(makeSubmission());
    formDefs.findByFormId.mockResolvedValue({ processors: [] });

    const body: import("./payment-webhook.service").EzpayCallbackBody = {
      _reference: "ref-1",
      _status: "Success",
      _transaction_number: "tx-1",
      _amount: "50",
    };
    await service.handleEzpayCallback(body);

    expect(txRepo.save).toHaveBeenCalledTimes(1);
    expect(txRepo.save).toHaveBeenCalledWith(existingTx);
    expect(existingTx.status).toBe(PaymentTransactionStatus.SUCCESS);
    expect(existingTx.dateSettled).toBeInstanceOf(Date);
  });

  describe("confirmReturn (browser return redirect)", () => {
    it("on Success: finalises the submission and returns success + formId", async () => {
      const payment = makePayment();
      const submission = makeSubmission();
      paymentRepo.findByReference.mockResolvedValue(payment);
      ezpay.verifyPayment.mockResolvedValue(makeVerified());
      txRepo.findOne.mockResolvedValue(null);
      txRepo.save.mockImplementation(async (e) => e);
      paymentRepo.save.mockImplementation(async (e) => e);
      submissionRepo.findOne.mockResolvedValue(submission);
      submissionRepo.save.mockImplementation(async (e) => e);
      formDefs.findByFormId.mockResolvedValue({ processors: [] });

      const result = await service.confirmReturn({
        reference: "ref-1",
        transactionNumber: "TXN-1",
      });

      expect(result).toEqual({
        outcome: "success",
        formId: "passport-renewal",
      });
      expect(ezpay.verifyPayment).toHaveBeenCalledWith(
        { transactionNumber: "TXN-1", reference: "ref-1" },
        "api-key",
      );
      expect(payment.status).toBe(PaymentStatus.SUCCESS);
      expect(events.emit).toHaveBeenCalledTimes(1);
    });

    it("on EzPay Failed: returns failed + formId, does not emit", async () => {
      const payment = makePayment();
      paymentRepo.findByReference.mockResolvedValue(payment);
      ezpay.verifyPayment.mockResolvedValue(makeVerified({ status: "Failed" }));
      txRepo.findOne.mockResolvedValue(null);
      txRepo.save.mockImplementation(async (e) => e);
      paymentRepo.save.mockImplementation(async (e) => e);

      const result = await service.confirmReturn({
        reference: "ref-1",
        transactionNumber: "TXN-1",
      });

      expect(result).toEqual({ outcome: "failed", formId: "passport-renewal" });
      expect(payment.status).toBe(PaymentStatus.FAILED);
      expect(events.emit).not.toHaveBeenCalled();
    });

    it("on amount mismatch: returns failed (treated as failure to the citizen)", async () => {
      const payment = makePayment({ expectedAmount: "75.00" });
      paymentRepo.findByReference.mockResolvedValue(payment);
      ezpay.verifyPayment.mockResolvedValue(makeVerified({ amount: 50.0 }));
      txRepo.findOne.mockResolvedValue(null);
      txRepo.save.mockImplementation(async (e) => e);
      paymentRepo.save.mockImplementation(async (e) => e);

      const result = await service.confirmReturn({ reference: "ref-1" });

      expect(result.outcome).toBe("failed");
      expect(payment.status).toBe(PaymentStatus.MISMATCHED);
      expect(events.emit).not.toHaveBeenCalled();
    });

    it("on Initiated: returns pending, leaves payment non-terminal", async () => {
      const payment = makePayment();
      paymentRepo.findByReference.mockResolvedValue(payment);
      ezpay.verifyPayment.mockResolvedValue(
        makeVerified({ status: "Initiated", amount: 50.0 }),
      );
      txRepo.findOne.mockResolvedValue(null);
      txRepo.save.mockImplementation(async (e) => e);

      const result = await service.confirmReturn({ reference: "ref-1" });

      expect(result).toEqual({
        outcome: "pending",
        formId: "passport-renewal",
      });
      expect(paymentRepo.save).not.toHaveBeenCalled();
      expect(events.emit).not.toHaveBeenCalled();
    });

    it("when the reference doesn't resolve: returns not_found with no formId", async () => {
      paymentRepo.findByReference.mockResolvedValue(null);

      const result = await service.confirmReturn({ reference: "missing" });

      expect(result).toEqual({ outcome: "not_found", formId: undefined });
      expect(ezpay.verifyPayment).not.toHaveBeenCalled();
    });
  });
});
