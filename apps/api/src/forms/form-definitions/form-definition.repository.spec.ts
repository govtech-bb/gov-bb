import { DataSource, EntityManager } from "typeorm";
import { FormDefinitionRepository } from "./form-definition.repository";
import { FormDefinitionEntity } from "../../database/entities/form-definition.entity";

function makeDataSource(): jest.Mocked<DataSource> {
  const fakeManager = {
    transaction: jest.fn(),
  } as unknown as EntityManager;

  return {
    createEntityManager: jest.fn().mockReturnValue(fakeManager),
  } as unknown as jest.Mocked<DataSource>;
}

describe("FormDefinitionRepository", () => {
  describe("constructor", () => {
    it("instantiates without throwing", () => {
      const dataSource = makeDataSource();
      expect(() => new FormDefinitionRepository(dataSource)).not.toThrow();
    });

    it("calls createEntityManager on the DataSource", () => {
      const dataSource = makeDataSource();
      new FormDefinitionRepository(dataSource);
      expect(dataSource.createEntityManager).toHaveBeenCalled();
    });

    it("is a repository for FormDefinitionEntity", () => {
      const dataSource = makeDataSource();
      const repo = new FormDefinitionRepository(dataSource);
      expect(repo.target).toBe(FormDefinitionEntity);
    });
  });

  describe("tx (inherited from BaseRepository)", () => {
    it("delegates to manager.transaction with SERIALIZABLE isolation", async () => {
      const dataSource = makeDataSource();
      const repo = new FormDefinitionRepository(dataSource);

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
      const repo = new FormDefinitionRepository(dataSource);

      const txError = new Error("tx failed");
      const mockTransaction = jest.fn().mockRejectedValue(txError);
      (
        repo as unknown as { manager: { transaction: jest.Mock } }
      ).manager.transaction = mockTransaction;

      await expect(repo.tx(async () => "ok")).rejects.toBe(txError);
    });
  });
});
