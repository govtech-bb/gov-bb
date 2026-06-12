import { Test, TestingModule } from "@nestjs/testing";
import { DataSource, In, LessThan } from "typeorm";
import { AbandonedPaymentCleanupService } from "./abandoned-payment-cleanup.service";
import {
  PaymentEntity,
  PaymentStatus,
} from "../database/entities/payment.entity";

describe("AbandonedPaymentCleanupService.runOnce", () => {
  let service: AbandonedPaymentCleanupService;
  let module: TestingModule;
  const paymentsRepo = { find: vi.fn(), save: vi.fn() };
  const dataSource = {
    getRepository: vi.fn().mockReturnValue(paymentsRepo),
  } as unknown as DataSource;

  beforeEach(async () => {
    vi.clearAllMocks();
    module = await Test.createTestingModule({
      providers: [
        AbandonedPaymentCleanupService,
        { provide: DataSource, useValue: dataSource },
      ],
    }).compile();
    service = module.get(AbandonedPaymentCleanupService);
  });

  afterEach(async () => {
    if (module) await module.close();
  });

  it("returns 0 when no stale payments exist", async () => {
    paymentsRepo.find.mockResolvedValue([]);

    const result = await service.runOnce({ ttlHours: 72 });

    expect(result.cancelled).toBe(0);
    expect(paymentsRepo.save).not.toHaveBeenCalled();
  });

  it("cancels stale PENDING/INITIATED payments without touching submission rows", async () => {
    const stale = [
      { id: "p-1", submissionId: "s-1", status: PaymentStatus.PENDING },
      { id: "p-2", submissionId: "s-2", status: PaymentStatus.INITIATED },
    ];
    paymentsRepo.find.mockResolvedValue(stale);
    paymentsRepo.save.mockImplementation(async (e) => e);

    const result = await service.runOnce({ ttlHours: 72 });

    expect(paymentsRepo.find).toHaveBeenCalledWith({
      where: {
        status: In([PaymentStatus.PENDING, PaymentStatus.INITIATED]),
        createdAt: LessThan(expect.any(Date)),
      },
    });
    expect(paymentsRepo.save).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ id: "p-1", status: PaymentStatus.CANCELLED }),
        expect.objectContaining({ id: "p-2", status: PaymentStatus.CANCELLED }),
      ]),
    );
    // Only the payment repository is touched. Submission rows are intentionally
    // left in PENDING_PAYMENT (per decision 3 in the plan).
    expect(dataSource.getRepository).toHaveBeenCalledTimes(1);
    expect(dataSource.getRepository).toHaveBeenCalledWith(PaymentEntity);
    expect(result.cancelled).toBe(2);
  });

  it("uses the provided ttlHours to compute the cutoff", async () => {
    paymentsRepo.find.mockResolvedValue([]);

    const before = Date.now();
    await service.runOnce({ ttlHours: 12 });
    const after = Date.now();

    const where = paymentsRepo.find.mock.calls[0][0].where;
    const cutoff = where.createdAt._value as Date;
    const cutoffMs = cutoff.getTime();
    expect(cutoffMs).toBeGreaterThanOrEqual(before - 12 * 60 * 60 * 1000);
    expect(cutoffMs).toBeLessThanOrEqual(after - 12 * 60 * 60 * 1000);
  });

  it("scheduled() swallows errors from runOnce and does not rethrow", async () => {
    // Branch: the catch block inside scheduled()
    paymentsRepo.find.mockRejectedValue(new Error("DB unavailable"));

    // scheduled() catches and logs — should not propagate
    await expect(service.scheduled()).resolves.toBeUndefined();
  });
});
