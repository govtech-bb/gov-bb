import { Test, TestingModule } from "@nestjs/testing";
import { Logger } from "@nestjs/common";
import { EventEmitter2 } from "@nestjs/event-emitter";
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
  let module: TestingModule;
  const ezpay = { createPayment: vi.fn() };
  const paymentRepo = {
    create: vi.fn().mockImplementation((d) => d),
    findOrCreate: vi.fn().mockImplementation(async (e: PaymentEntity) => ({
      ...e,
      id: "pay-1",
      status: PaymentStatus.PENDING,
    })),
    save: vi.fn().mockImplementation(async (e) => e),
  };
  const deptKeys = new DepartmentKeyResolver({ education: "edu-key" });
  const events = { emit: vi.fn() };

  beforeEach(async () => {
    vi.clearAllMocks();
    paymentRepo.create.mockImplementation((d) => d);
    paymentRepo.findOrCreate.mockImplementation(async (e: PaymentEntity) => ({
      ...e,
      id: "pay-1",
      status: PaymentStatus.PENDING,
    }));
    paymentRepo.save.mockImplementation(async (e) => e);
    module = await Test.createTestingModule({
      providers: [
        PaymentProcessor,
        { provide: EzpayClient, useValue: ezpay },
        { provide: DepartmentKeyResolver, useValue: deptKeys },
        { provide: PaymentRepository, useValue: paymentRepo },
        { provide: EventEmitter2, useValue: events },
      ],
    }).compile();
    processor = module.get(PaymentProcessor);
  });

  afterEach(async () => {
    if (module) await module.close();
  });

  const event = (): SubmissionCreatedEvent => ({
    submissionId: "sub-1",
    referenceCode: "SCH-20260604-130732-000001",
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
    expect(paymentRepo.findOrCreate).toHaveBeenCalled();
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

  it("emits payment.required with the pre-payment email details on fresh initiation", async () => {
    ezpay.createPayment.mockResolvedValue({
      token: "tok-1",
      url: "https://ezpay/p?token=tok-1",
    });

    await processor.process(event());

    expect(events.emit).toHaveBeenCalledWith("payment.required", {
      customerEmail: "p@q.r",
      formId: "school-fees",
      formVersion: "1.0.0",
      referenceCode: "SCH-20260604-130732-000001",
      submissionId: "sub-1",
      amount: 50,
      description: "Term fees",
      paymentUrl: "https://ezpay/p?token=tok-1",
    });
  });

  it("does NOT emit payment.required when returning a cached payment URL (retry)", async () => {
    paymentRepo.findOrCreate.mockResolvedValue({
      id: "pay-1",
      submissionId: "sub-1",
      status: PaymentStatus.INITIATED,
      providerUrl: "https://ezpay/p?token=existing",
      expectedAmount: "50",
      description: "Term fees",
    } as PaymentEntity);

    await processor.process(event());

    expect(events.emit).not.toHaveBeenCalled();
  });

  it("returns the existing payment URL on retry (idempotent)", async () => {
    paymentRepo.findOrCreate.mockResolvedValue({
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
    e.processors = [{ type: "email", config: { recipientField: "x" } }];
    await expect(processor.process(e)).rejects.toThrow();
  });

  it("throws when amount is not a number (string)", async () => {
    // Branch: `typeof cfg.amount !== "number"`
    const e = event();
    (e.processors[0].config as Record<string, unknown>).amount = "fifty";
    await expect(processor.process(e)).rejects.toThrow(/amount must be/);
  });

  it("throws when amount is Infinity (non-finite)", async () => {
    // Branch: `!Number.isFinite(cfg.amount)`
    const e = event();
    (e.processors[0].config as Record<string, unknown>).amount = Infinity;
    await expect(processor.process(e)).rejects.toThrow(/amount must be/);
  });

  it("throws when amount is negative", async () => {
    // Branch: `cfg.amount < 0`
    const e = event();
    (e.processors[0].config as Record<string, unknown>).amount = -1;
    await expect(processor.process(e)).rejects.toThrow(/amount must be/);
  });

  it("returns cached URL even when status is PENDING (prior partial attempt)", async () => {
    paymentRepo.findOrCreate.mockResolvedValue({
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
        { provide: EventEmitter2, useValue: events },
      ],
    }).compile();
    const isolated = moduleRef.get(PaymentProcessor);

    try {
      await expect(isolated.process(event())).rejects.toThrow(/department/);
    } finally {
      await moduleRef.close();
    }
  });

  it("propagates EzPay client errors", async () => {
    ezpay.createPayment.mockRejectedValue(
      new Error("EzPay createPayment failed [E-059]: Invalid Payment Code"),
    );
    await expect(processor.process(event())).rejects.toThrow(/E-059/);
  });

  it("warns and uses only the first config when multiple payment configs are present", async () => {
    const warn = vi
      .spyOn(Logger.prototype, "warn")
      .mockImplementation(() => {});
    ezpay.createPayment.mockResolvedValue({
      token: "tok-1",
      url: "https://ezpay/p?token=tok-1",
    });

    const e = event();
    const firstPaymentCfg = (
      e.processors[0] as Extract<
        (typeof e.processors)[number],
        { type: "payment" }
      >
    ).config;
    e.processors = [
      e.processors[0],
      {
        type: "payment",
        config: {
          ...firstPaymentCfg,
          paymentCode: "EDU-002",
          amount: 999,
          description: "Should be ignored",
        },
      },
    ];

    await processor.process(e);

    // Only the first config drives the EzPay call.
    expect(ezpay.createPayment).toHaveBeenCalledTimes(1);
    expect(ezpay.createPayment).toHaveBeenCalledWith(
      expect.objectContaining({ paymentCode: "EDU-001", amount: 50 }),
      "edu-key",
    );
    // Warning identifies the submission so operators can spot misconfigured forms.
    expect(warn).toHaveBeenCalledWith(
      expect.stringMatching(/payment configs.+sub-1/i),
    );
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("school-fees"));
    warn.mockRestore();
  });
});
