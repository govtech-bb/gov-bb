import { Test } from "@nestjs/testing";
import { DataSource } from "typeorm";
import { PaymentRepository } from "./payment.repository";
import {
  PaymentEntity,
  PaymentStatus,
  PaymentProvider,
} from "../database/entities/payment.entity";

describe("PaymentRepository.upsertBySubmission", () => {
  let repo: PaymentRepository;
  const findOne = jest.fn();
  const save = jest.fn();
  const dataSource = {
    getRepository: () => ({ findOne, save }),
  } as unknown as DataSource;

  beforeEach(async () => {
    findOne.mockReset();
    save.mockReset();
    const module = await Test.createTestingModule({
      providers: [
        PaymentRepository,
        { provide: DataSource, useValue: dataSource },
      ],
    }).compile();
    repo = module.get(PaymentRepository);
  });

  it("returns existing Payment when submissionId is already in DB", async () => {
    const existing = { id: "p-1", submissionId: "sub-1" } as PaymentEntity;
    findOne.mockResolvedValue(existing);
    const result = await repo.upsertBySubmission({
      submissionId: "sub-1",
    } as PaymentEntity);
    expect(result).toBe(existing);
    expect(save).not.toHaveBeenCalled();
  });

  it("creates new Payment when none exists", async () => {
    findOne.mockResolvedValue(null);
    save.mockImplementation(async (e) => ({ ...e, id: "p-new" }));
    const draft = {
      submissionId: "sub-2",
      provider: PaymentProvider.EZPAY,
      status: PaymentStatus.PENDING,
    } as PaymentEntity;
    const result = await repo.upsertBySubmission(draft);
    expect(result.id).toBe("p-new");
    expect(save).toHaveBeenCalledWith(draft);
  });

  it("create() returns a new entity instance", () => {
    const create = jest.fn().mockImplementation((d) => ({ ...d }));
    const ds = { getRepository: () => ({ create }) } as unknown as DataSource;
    const r = new PaymentRepository(ds);
    expect(r.create({ submissionId: "s-1" })).toEqual({ submissionId: "s-1" });
  });
});
