import { Test, TestingModule } from "@nestjs/testing";
import { DataSource, In } from "typeorm";
import {
  PaymentRepository,
  RECONCILIATION_MAX_AGE_HOURS,
} from "./payment.repository";
import {
  PaymentEntity,
  PaymentStatus,
  PaymentProvider,
} from "../database/entities/payment.entity";

describe("PaymentRepository.findOrCreate", () => {
  let repo: PaymentRepository;
  let module: TestingModule;
  const findOne = jest.fn();
  const find = jest.fn();
  const save = jest.fn();
  const dataSource = {
    getRepository: () => ({ findOne, find, save }),
  } as unknown as DataSource;

  beforeEach(async () => {
    findOne.mockReset();
    find.mockReset();
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

  it("findReconcilable() queries PENDING+INITIATED bounded to the age window", async () => {
    const rows = [{ id: "p-1" }] as PaymentEntity[];
    find.mockResolvedValue(rows);

    const lower = Date.now() - RECONCILIATION_MAX_AGE_HOURS * 60 * 60 * 1000;
    const result = await repo.findReconcilable();
    const upper = Date.now() - RECONCILIATION_MAX_AGE_HOURS * 60 * 60 * 1000;

    expect(result).toBe(rows);
    expect(find).toHaveBeenCalledTimes(1);
    const arg = find.mock.calls[0][0];
    expect(arg.where.status).toEqual(
      In([PaymentStatus.PENDING, PaymentStatus.INITIATED]),
    );
    // createdAt is a MoreThanOrEqual(cutoff) FindOperator; the cutoff must sit
    // ~RECONCILIATION_MAX_AGE_HOURS in the past (bracketed by the run above).
    const cutoff = (arg.where.createdAt.value as Date).getTime();
    expect(cutoff).toBeGreaterThanOrEqual(lower);
    expect(cutoff).toBeLessThanOrEqual(upper);
  });
});
