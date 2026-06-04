import { DataSource, EntityManager } from "typeorm";
import { FormDraftRepository } from "./form-draft.repository";
import { FormDraftEntity } from "../../database/entities/form-draft.entity";

function makeDataSource(): jest.Mocked<DataSource> {
  const fakeManager = {
    transaction: jest.fn(),
  } as unknown as EntityManager;

  return {
    createEntityManager: jest.fn().mockReturnValue(fakeManager),
  } as unknown as jest.Mocked<DataSource>;
}

describe("FormDraftRepository", () => {
  describe("constructor", () => {
    it("instantiates without throwing", () => {
      const dataSource = makeDataSource();
      expect(() => new FormDraftRepository(dataSource)).not.toThrow();
    });

    it("calls createEntityManager on the DataSource", () => {
      const dataSource = makeDataSource();
      new FormDraftRepository(dataSource);
      expect(dataSource.createEntityManager).toHaveBeenCalled();
    });

    it("is a repository for FormDraftEntity", () => {
      const dataSource = makeDataSource();
      const repo = new FormDraftRepository(dataSource);
      // TypeORM Repository stores the target entity class
      expect(repo.target).toBe(FormDraftEntity);
    });
  });

  describe("tx (inherited from BaseRepository)", () => {
    it("delegates to manager.transaction with SERIALIZABLE isolation", async () => {
      const dataSource = makeDataSource();
      const repo = new FormDraftRepository(dataSource);

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

      await repo.tx(async () => "done");

      expect(mockTransaction).toHaveBeenCalledWith(
        "SERIALIZABLE",
        expect.any(Function),
      );
    });

    it("re-throws errors from the transaction callback", async () => {
      const dataSource = makeDataSource();
      const repo = new FormDraftRepository(dataSource);

      const txError = new Error("tx failed");
      const mockTransaction = jest.fn().mockRejectedValue(txError);
      (
        repo as unknown as { manager: { transaction: jest.Mock } }
      ).manager.transaction = mockTransaction;

      await expect(repo.tx(async () => "ok")).rejects.toBe(txError);
    });
  });
});
