import { DataSource, EntityManager } from "typeorm";
import { FormSubmissionRepository } from "./form-submission.repository";
import { FormSubmissionEntity } from "../../database/entities/form-submission.entity";

function makeDataSource(): jest.Mocked<DataSource> {
  const fakeManager = {
    transaction: jest.fn(),
  } as unknown as EntityManager;

  return {
    createEntityManager: jest.fn().mockReturnValue(fakeManager),
  } as unknown as jest.Mocked<DataSource>;
}

describe("FormSubmissionRepository", () => {
  describe("constructor", () => {
    it("instantiates without throwing", () => {
      const dataSource = makeDataSource();
      expect(() => new FormSubmissionRepository(dataSource)).not.toThrow();
    });

    it("calls createEntityManager on the DataSource", () => {
      const dataSource = makeDataSource();
      new FormSubmissionRepository(dataSource);
      expect(dataSource.createEntityManager).toHaveBeenCalled();
    });

    it("is a repository for FormSubmissionEntity", () => {
      const dataSource = makeDataSource();
      const repo = new FormSubmissionRepository(dataSource);
      expect(repo.target).toBe(FormSubmissionEntity);
    });
  });

  describe("tx (inherited from BaseRepository) — success path", () => {
    it("delegates to manager.transaction with SERIALIZABLE isolation", async () => {
      const dataSource = makeDataSource();
      const repo = new FormSubmissionRepository(dataSource);

      const fakeTxManager = {} as EntityManager;
      const mockTransaction = jest
        .fn()
        .mockImplementation(
          (_iso: string, cb: (m: EntityManager) => Promise<unknown>) =>
            cb(fakeTxManager),
        );
      (
        repo as unknown as { manager: { transaction: jest.Mock } }
      ).manager.transaction = mockTransaction;

      const result = await repo.tx(async () => "committed");

      expect(mockTransaction).toHaveBeenCalledWith(
        "SERIALIZABLE",
        expect.any(Function),
      );
      expect(result).toBe("committed");
    });

    it("passes a cloned repo scoped to the transaction manager", async () => {
      const dataSource = makeDataSource();
      const repo = new FormSubmissionRepository(dataSource);

      const fakeTxManager = { id: "tx-manager" } as unknown as EntityManager;
      const mockTransaction = jest
        .fn()
        .mockImplementation(
          (_iso: string, cb: (m: EntityManager) => Promise<unknown>) =>
            cb(fakeTxManager),
        );
      (
        repo as unknown as { manager: { transaction: jest.Mock } }
      ).manager.transaction = mockTransaction;

      let capturedRepo: FormSubmissionRepository | undefined;
      await repo.tx(async (txRepo) => {
        capturedRepo = txRepo;
      });

      expect(capturedRepo).toBeDefined();
      expect(
        (capturedRepo as unknown as { manager: EntityManager }).manager,
      ).toBe(fakeTxManager);
    });
  });

  describe("tx (inherited from BaseRepository) — error path", () => {
    it("re-throws the original error and rolls back when the callback throws", async () => {
      const dataSource = makeDataSource();
      const repo = new FormSubmissionRepository(dataSource);

      const originalError = new Error("unique constraint violation");

      const mockTransaction = jest
        .fn()
        .mockImplementation(
          (_iso: string, cb: (m: EntityManager) => Promise<unknown>) =>
            cb({} as EntityManager),
        );
      (
        repo as unknown as { manager: { transaction: jest.Mock } }
      ).manager.transaction = mockTransaction;

      await expect(
        repo.tx(async () => {
          throw originalError;
        }),
      ).rejects.toBe(originalError);
    });

    it("re-throws errors raised by the EntityManager itself (e.g. deadlock)", async () => {
      const dataSource = makeDataSource();
      const repo = new FormSubmissionRepository(dataSource);

      const deadlockError = new Error("deadlock detected");
      const mockTransaction = jest.fn().mockRejectedValue(deadlockError);
      (
        repo as unknown as { manager: { transaction: jest.Mock } }
      ).manager.transaction = mockTransaction;

      await expect(repo.tx(async () => "ok")).rejects.toBe(deadlockError);
    });
  });
});
