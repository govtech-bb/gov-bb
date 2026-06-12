import { Test, TestingModule } from "@nestjs/testing";
import { DataSource } from "typeorm";
import {
  PaymentReconciliationService,
  RECONCILIATION_LOCK_KEY,
} from "./payment-reconciliation.service";
import { PaymentRepository } from "./payment.repository";
import { PaymentWebhookService } from "./payment-webhook.service";
import { PaymentStatus } from "../database/entities/payment.entity";

describe("PaymentReconciliationService.runOnce", () => {
  let service: PaymentReconciliationService;
  let module: TestingModule;
  const query = vi.fn();
  const release = vi.fn().mockResolvedValue(undefined);
  const connect = vi.fn().mockResolvedValue(undefined);
  const dataSource = {
    createQueryRunner: vi.fn().mockReturnValue({ query, release, connect }),
  } as unknown as DataSource;
  const paymentRepo = { findReconcilable: vi.fn() };
  const webhook = {
    handleEzpayCallback: vi.fn().mockResolvedValue({ acknowledged: true }),
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    webhook.handleEzpayCallback.mockResolvedValue({ acknowledged: true });
    module = await Test.createTestingModule({
      providers: [
        PaymentReconciliationService,
        { provide: DataSource, useValue: dataSource },
        { provide: PaymentRepository, useValue: paymentRepo },
        { provide: PaymentWebhookService, useValue: webhook },
      ],
    }).compile();
    service = module.get(PaymentReconciliationService);
  });

  afterEach(async () => {
    if (module) await module.close();
  });

  it("aborts when advisory lock is held by another instance", async () => {
    query.mockResolvedValueOnce([{ pg_try_advisory_lock: false }]);
    const result = await service.runOnce();
    expect(result).toEqual({ skipped: true, processed: 0 });
    expect(paymentRepo.findReconcilable).not.toHaveBeenCalled();
  });

  it("replays each non-terminal payment through the webhook entry point by reference", async () => {
    query.mockResolvedValueOnce([{ pg_try_advisory_lock: true }]);
    paymentRepo.findReconcilable.mockResolvedValue([
      {
        referenceNumber: "ref-1",
        expectedAmount: "50.00",
        status: PaymentStatus.PENDING,
      },
      {
        referenceNumber: "ref-2",
        expectedAmount: "5.00",
        status: PaymentStatus.INITIATED,
      },
    ]);
    query.mockResolvedValueOnce([{ pg_advisory_unlock: true }]);

    const result = await service.runOnce();

    expect(webhook.handleEzpayCallback).toHaveBeenCalledTimes(2);
    // Only the reference matters — the handler re-verifies via check_api and
    // ignores the rest of the synthetic body.
    expect(webhook.handleEzpayCallback).toHaveBeenNthCalledWith(1, {
      _reference: "ref-1",
      _status: "Initiated",
      _transaction_number: "",
      _amount: "50.00",
    });
    expect(webhook.handleEzpayCallback).toHaveBeenNthCalledWith(2, {
      _reference: "ref-2",
      _status: "Initiated",
      _transaction_number: "",
      _amount: "5.00",
    });
    expect(result).toEqual({ skipped: false, processed: 2 });
  });

  it("reconciles from our own pending payments — never queries EzPay transaction listing", async () => {
    query.mockResolvedValueOnce([{ pg_try_advisory_lock: true }]);
    paymentRepo.findReconcilable.mockResolvedValue([]);
    query.mockResolvedValueOnce([{ pg_advisory_unlock: true }]);

    const result = await service.runOnce();

    expect(paymentRepo.findReconcilable).toHaveBeenCalledTimes(1);
    expect(webhook.handleEzpayCallback).not.toHaveBeenCalled();
    expect(result).toEqual({ skipped: false, processed: 0 });
  });

  it("swallows a single payment's verify failure and continues the batch", async () => {
    query.mockResolvedValueOnce([{ pg_try_advisory_lock: true }]);
    paymentRepo.findReconcilable.mockResolvedValue([
      {
        referenceNumber: "ref-bad",
        expectedAmount: "5.00",
        status: PaymentStatus.PENDING,
      },
      {
        referenceNumber: "ref-ok",
        expectedAmount: "5.00",
        status: PaymentStatus.PENDING,
      },
    ]);
    webhook.handleEzpayCallback
      .mockRejectedValueOnce(new Error("EzPay timeout"))
      .mockResolvedValueOnce({ acknowledged: true });
    query.mockResolvedValueOnce([{ pg_advisory_unlock: true }]);

    const result = await service.runOnce();

    expect(webhook.handleEzpayCallback).toHaveBeenCalledTimes(2);
    expect(result).toEqual({ skipped: false, processed: 1 });
    // lock still released despite the per-payment failure
    expect(query).toHaveBeenLastCalledWith(`SELECT pg_advisory_unlock($1)`, [
      RECONCILIATION_LOCK_KEY,
    ]);
  });

  it("pins the lock + unlock to a single QueryRunner and releases it", async () => {
    query.mockResolvedValueOnce([{ pg_try_advisory_lock: true }]);
    paymentRepo.findReconcilable.mockResolvedValue([]);
    query.mockResolvedValueOnce([{ pg_advisory_unlock: true }]);

    await service.runOnce();

    expect(dataSource.createQueryRunner).toHaveBeenCalledTimes(1);
    expect(connect).toHaveBeenCalledTimes(1);
    expect(release).toHaveBeenCalledTimes(1);
  });

  it("scheduled() swallows errors from runOnce and does not rethrow", async () => {
    query.mockResolvedValueOnce([{ pg_try_advisory_lock: true }]);
    paymentRepo.findReconcilable.mockRejectedValue(new Error("DB down"));
    query.mockResolvedValueOnce([{ pg_advisory_unlock: true }]);

    await expect(service.scheduled()).resolves.toBeUndefined();
  });
});
