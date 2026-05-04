import { Test } from "@nestjs/testing";
import { PaymentProcessor } from "./payment.processor";
import { EzpayClient } from "./ezpay/ezpay.client";
import { DepartmentKeyResolver } from "./ezpay/department-keys";
import { PaymentRepository } from "../../../../payments/payment.repository";
import {
  PaymentEntity,
  PaymentStatus,
} from "../../../../database/entities/payment.entity";
import type { SubmissionCreatedEvent } from "../../submissions.types";

describe("PaymentProcessor.process", () => {
  let processor: PaymentProcessor;
  const ezpay = { createPayment: jest.fn() };
  const paymentRepo = {
    create: jest.fn().mockImplementation((d) => d),
    upsertBySubmission: jest
      .fn()
      .mockImplementation(async (e: PaymentEntity) => ({
        ...e,
        id: "pay-1",
        status: PaymentStatus.PENDING,
      })),
    save: jest.fn().mockImplementation(async (e) => e),
  };
  const deptKeys = new DepartmentKeyResolver({ education: "edu-key" });

  beforeEach(async () => {
    jest.clearAllMocks();
    paymentRepo.create.mockImplementation((d) => d);
    paymentRepo.upsertBySubmission.mockImplementation(
      async (e: PaymentEntity) => ({
        ...e,
        id: "pay-1",
        status: PaymentStatus.PENDING,
      }),
    );
    paymentRepo.save.mockImplementation(async (e) => e);
    const module = await Test.createTestingModule({
      providers: [
        PaymentProcessor,
        { provide: EzpayClient, useValue: ezpay },
        { provide: DepartmentKeyResolver, useValue: deptKeys },
        { provide: PaymentRepository, useValue: paymentRepo },
      ],
    }).compile();
    processor = module.get(PaymentProcessor);
  });

  const event = (): SubmissionCreatedEvent => ({
    submissionId: "sub-1",
    formId: "school-fees",
    formVersion: "1.0.0",
    idempotencyKey: "idem-1",
    processors: [
      {
        type: "payment",
        config: {
          provider: "ezpay",
          department: "education",
          paymentCode: "EDU-001",
          amount: 50,
          description: "Term fees",
          customerEmailPath: "personal.email",
          customerNamePath: "personal.full-name",
        },
      },
    ],
    values: { personal: { email: "p@q.r", "full-name": "Marcus Aurelius" } },
    meta: {
      schemaVersion: 1,
      pinnedFormVersion: "1.0.0",
      draftId: "d-1",
      activeStepIds: [],
      hiddenStepIds: [],
      activeFieldIds: {},
      hiddenFieldIds: {},
      visitedPages: [],
      submittedAt: "2026-04-29T00:00:00.000Z",
    },
  });

  it("creates Payment row, calls EzPay, returns deferred", async () => {
    ezpay.createPayment.mockResolvedValue({
      token: "tok-1",
      url: "https://ezpay/p?token=tok-1",
    });

    const result = await processor.process(event());

    expect(result).toEqual({
      kind: "deferred",
      data: {
        paymentUrl: "https://ezpay/p?token=tok-1",
        paymentId: "pay-1",
        amount: 50,
        description: "Term fees",
      },
    });
    expect(paymentRepo.upsertBySubmission).toHaveBeenCalled();
    expect(ezpay.createPayment).toHaveBeenCalledWith(
      expect.objectContaining({
        paymentCode: "EDU-001",
        customerEmail: "p@q.r",
        customerName: "Marcus Aurelius",
      }),
      "edu-key",
    );
    expect(paymentRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        status: PaymentStatus.INITIATED,
        providerToken: "tok-1",
      }),
    );
  });

  it("returns the existing payment URL on retry (idempotent)", async () => {
    paymentRepo.upsertBySubmission.mockResolvedValue({
      id: "pay-1",
      submissionId: "sub-1",
      status: PaymentStatus.INITIATED,
      providerUrl: "https://ezpay/p?token=existing",
      expectedAmount: "50",
      description: "Term fees",
    } as PaymentEntity);

    const result = await processor.process(event());

    expect(ezpay.createPayment).not.toHaveBeenCalled();
    expect(result.kind).toBe("deferred");
    if (result.kind === "deferred") {
      expect(result.data.paymentUrl).toBe("https://ezpay/p?token=existing");
    }
  });

  it("throws when customer email path is missing in values", async () => {
    const e = event();
    e.values = { personal: { "full-name": "X" } };
    await expect(processor.process(e)).rejects.toThrow(/customerEmailPath/);
  });

  it("throws when no payment processor is in the processors array", async () => {
    const e = event();
    e.processors = [{ type: "email", config: { to: "x" } }];
    await expect(processor.process(e)).rejects.toThrow();
  });

  it("returns cached URL even when status is PENDING (prior partial attempt)", async () => {
    paymentRepo.upsertBySubmission.mockResolvedValue({
      id: "pay-1",
      submissionId: "sub-1",
      status: PaymentStatus.PENDING,
      providerUrl: "https://ezpay/p?token=stale",
      expectedAmount: "50",
      description: "Term fees",
    } as PaymentEntity);

    const result = await processor.process(event());

    expect(ezpay.createPayment).not.toHaveBeenCalled();
    expect(result.kind).toBe("deferred");
    if (result.kind === "deferred") {
      expect(result.data.paymentUrl).toBe("https://ezpay/p?token=stale");
    }
  });

  it("throws when customerNamePath is missing in values", async () => {
    const e = event();
    e.values = { personal: { email: "p@q.r" } };
    await expect(processor.process(e)).rejects.toThrow(/customerNamePath/);
  });

  it("throws when no API key is configured for the department", async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        PaymentProcessor,
        { provide: EzpayClient, useValue: ezpay },
        {
          provide: DepartmentKeyResolver,
          useValue: new DepartmentKeyResolver({}),
        },
        { provide: PaymentRepository, useValue: paymentRepo },
      ],
    }).compile();
    const isolated = moduleRef.get(PaymentProcessor);

    await expect(isolated.process(event())).rejects.toThrow(/department/);
  });

  it("propagates EzPay client errors", async () => {
    ezpay.createPayment.mockRejectedValue(
      new Error("EzPay createPayment failed [E-059]: Invalid Payment Code"),
    );
    await expect(processor.process(event())).rejects.toThrow(/E-059/);
  });
});
