import { Test, TestingModule } from "@nestjs/testing";
import { DataSource } from "typeorm";
import { PaymentRepository } from "./payment.repository";
import {
  PaymentEntity,
  PaymentStatus,
  PaymentProvider,
} from "../database/entities/payment.entity";

describe("PaymentRepository.findOrCreate", () => {
  let repo: PaymentRepository;
  let module: TestingModule;
  const findOne = jest.fn();
  const save = jest.fn();
  const dataSource = {
    getRepository: () => ({ findOne, save }),
  } as unknown as DataSource;

  beforeEach(async () => {
    findOne.mockReset();
    save.mockReset();
    module = await Test.createTestingModule({
      providers: [
        PaymentRepository,
        { provide: DataSource, useValue: dataSource },
      ],
    }).compile();
    repo = module.get(PaymentRepository);
  });

  afterEach(async () => {
    if (module) await module.close();
  });

  it("returns existing Payment when submissionId is already in DB", async () => {
    const existing = { id: "p-1", submissionId: "sub-1" } as PaymentEntity;
    findOne.mockResolvedValue(existing);
    const result = await repo.findOrCreate({
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
    const result = await repo.findOrCreate(draft);
    expect(result.id).toBe("p-new");
    expect(save).toHaveBeenCalledWith(draft);
  });

  it("create() returns a new entity instance", () => {
    const create = jest.fn().mockImplementation((d) => ({ ...d }));
    const ds = { getRepository: () => ({ create }) } as unknown as DataSource;
    const r = new PaymentRepository(ds);
    expect(r.create({ submissionId: "s-1" })).toEqual({ submissionId: "s-1" });
  });

  it("findByReference() delegates to repo.findOne with referenceNumber", async () => {
    const entity = { id: "p-ref", referenceNumber: "REF-001" } as PaymentEntity;
    findOne.mockResolvedValue(entity);
    const result = await repo.findByReference("REF-001");
    expect(findOne).toHaveBeenCalledWith({
      where: { referenceNumber: "REF-001" },
    });
    expect(result).toBe(entity);
  });

  it("findByReference() returns null when not found", async () => {
    findOne.mockResolvedValue(null);
    const result = await repo.findByReference("UNKNOWN");
    expect(result).toBeNull();
  });

  it("save() delegates to repo.save and returns the saved entity", async () => {
    const entity = { id: "p-save", submissionId: "sub-save" } as PaymentEntity;
    save.mockResolvedValue(entity);
    const result = await repo.save(entity);
    expect(save).toHaveBeenCalledWith(entity);
    expect(result).toBe(entity);
  });
});
