import { Test, TestingModule } from "@nestjs/testing";
import { DataSource } from "typeorm";
import {
  PaymentReconciliationService,
  RECONCILIATION_LOCK_KEY,
} from "./payment-reconciliation.service";
import { EzpayClient } from "../forms/submissions/processors/payment/ezpay/ezpay.client";
import { DepartmentKeyResolver } from "../forms/submissions/processors/payment/ezpay/department-keys";
import { PaymentRepository } from "./payment.repository";
import { PaymentWebhookService } from "./payment-webhook.service";
import { PaymentStatus } from "../database/entities/payment.entity";

describe("PaymentReconciliationService.runOnce", () => {
  let service: PaymentReconciliationService;
  let module: TestingModule;
  const query = jest.fn();
  const release = jest.fn().mockResolvedValue(undefined);
  const connect = jest.fn().mockResolvedValue(undefined);
  const dataSource = {
    createQueryRunner: jest.fn().mockReturnValue({ query, release, connect }),
  } as unknown as DataSource;
  const ezpay = { queryTransactions: jest.fn() };
  const paymentRepo = { findByReference: jest.fn() };
  const webhook = {
    handleEzpayCallback: jest.fn().mockResolvedValue({ acknowledged: true }),
  };
  const deptKeys = new DepartmentKeyResolver({ education: "edu-key" });

  beforeEach(async () => {
    jest.clearAllMocks();
    module = await Test.createTestingModule({
      providers: [
        PaymentReconciliationService,
        { provide: DataSource, useValue: dataSource },
        { provide: EzpayClient, useValue: ezpay },
        { provide: PaymentRepository, useValue: paymentRepo },
        { provide: PaymentWebhookService, useValue: webhook },
        { provide: DepartmentKeyResolver, useValue: deptKeys },
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
    expect(ezpay.queryTransactions).not.toHaveBeenCalled();
  });

  it("queries each department over a 24h rolling window", async () => {
    query.mockResolvedValueOnce([{ pg_try_advisory_lock: true }]);
    ezpay.queryTransactions.mockResolvedValue([]);
    query.mockResolvedValueOnce([{ pg_advisory_unlock: true }]);

    await service.runOnce();

    expect(ezpay.queryTransactions).toHaveBeenCalledTimes(1);
    const [start, end, apiKey] = ezpay.queryTransactions.mock.calls[0];
    expect(apiKey).toBe("edu-key");
    const startMs = Date.parse(start);
    const endMs = Date.parse(end);
    expect(endMs - startMs).toBe(24 * 60 * 60 * 1000);
  });

  it("replays divergent transactions through the webhook entry point", async () => {
    query.mockResolvedValueOnce([{ pg_try_advisory_lock: true }]);
    ezpay.queryTransactions.mockResolvedValue([
      {
        reference: "ref-1",
        transactionNumber: "tx-1",
        status: "Success",
        amount: 50,
      },
    ]);
    paymentRepo.findByReference.mockResolvedValue({
      id: "p-1",
      status: PaymentStatus.INITIATED,
    });
    query.mockResolvedValueOnce([{ pg_advisory_unlock: true }]);

    const result = await service.runOnce();

    expect(webhook.handleEzpayCallback).toHaveBeenCalledWith({
      _reference: "ref-1",
      _status: "Success",
      _transaction_number: "tx-1",
      _amount: "50",
    });
    expect(result).toEqual({ skipped: false, processed: 1 });
  });

  it("skips already-finalised payments (status=SUCCESS and tx=Success)", async () => {
    query.mockResolvedValueOnce([{ pg_try_advisory_lock: true }]);
    ezpay.queryTransactions.mockResolvedValue([
      {
        reference: "ref-1",
        transactionNumber: "tx-1",
        status: "Success",
        amount: 50,
      },
    ]);
    paymentRepo.findByReference.mockResolvedValue({
      id: "p-1",
      status: PaymentStatus.SUCCESS,
    });
    query.mockResolvedValueOnce([{ pg_advisory_unlock: true }]);

    const result = await service.runOnce();

    expect(webhook.handleEzpayCallback).not.toHaveBeenCalled();
    expect(result.processed).toBe(0);
  });

  it("skips transactions with no matching local payment", async () => {
    query.mockResolvedValueOnce([{ pg_try_advisory_lock: true }]);
    ezpay.queryTransactions.mockResolvedValue([
      {
        reference: "unknown-ref",
        transactionNumber: "tx-x",
        status: "Success",
        amount: 50,
      },
    ]);
    paymentRepo.findByReference.mockResolvedValue(null);
    query.mockResolvedValueOnce([{ pg_advisory_unlock: true }]);

    const result = await service.runOnce();

    expect(webhook.handleEzpayCallback).not.toHaveBeenCalled();
    expect(result.processed).toBe(0);
  });

  it("releases the advisory lock even when EzPay throws", async () => {
    query.mockResolvedValueOnce([{ pg_try_advisory_lock: true }]);
    ezpay.queryTransactions.mockRejectedValue(new Error("EzPay down"));
    query.mockResolvedValueOnce([{ pg_advisory_unlock: true }]);

    await expect(service.runOnce()).rejects.toThrow("EzPay down");
    expect(query).toHaveBeenLastCalledWith(`SELECT pg_advisory_unlock($1)`, [
      RECONCILIATION_LOCK_KEY,
    ]);
  });

  it("pins the lock + unlock to a single QueryRunner and releases it", async () => {
    query.mockResolvedValueOnce([{ pg_try_advisory_lock: true }]);
    ezpay.queryTransactions.mockResolvedValue([]);
    query.mockResolvedValueOnce([{ pg_advisory_unlock: true }]);

    await service.runOnce();

    expect(dataSource.createQueryRunner).toHaveBeenCalledTimes(1);
    expect(connect).toHaveBeenCalledTimes(1);
    expect(release).toHaveBeenCalledTimes(1);
  });

  it("skips when local FAILED matches remote Failed", async () => {
    query.mockResolvedValueOnce([{ pg_try_advisory_lock: true }]);
    ezpay.queryTransactions.mockResolvedValue([
      {
        reference: "ref-1",
        transactionNumber: "tx-1",
        status: "Failed",
        amount: 50,
      },
    ]);
    paymentRepo.findByReference.mockResolvedValue({
      id: "p-1",
      status: PaymentStatus.FAILED,
    });
    query.mockResolvedValueOnce([{ pg_advisory_unlock: true }]);

    const result = await service.runOnce();

    expect(webhook.handleEzpayCallback).not.toHaveBeenCalled();
    expect(result.processed).toBe(0);
  });

  it("scheduled() swallows errors from runOnce and does not rethrow", async () => {
    // Branch: the catch block inside scheduled()
    query.mockResolvedValueOnce([{ pg_try_advisory_lock: true }]);
    ezpay.queryTransactions.mockRejectedValue(new Error("EzPay unavailable"));
    // The unlock query will also be called in the finally block
    query.mockResolvedValueOnce([{ pg_advisory_unlock: true }]);

    // scheduled() should catch and swallow — not propagate
    await expect(service.scheduled()).resolves.toBeUndefined();
  });
});
