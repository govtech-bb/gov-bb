import { EntityManager } from "typeorm";
import { BaseRepository } from "./base.repository";

// ---------------------------------------------------------------------------
// Minimal concrete subclass for testing the abstract-ish base
// ---------------------------------------------------------------------------
class TestRepository extends BaseRepository<object> {}

function makeRepo(
  txResult?: unknown,
  txError?: Error,
): {
  repo: TestRepository;
  mockTransaction: jest.Mock;
} {
  const mockTransaction = jest.fn();

  if (txError) {
    mockTransaction.mockRejectedValue(txError);
  } else {
    mockTransaction.mockImplementation(
      (
        _isolation: string,
        cb: (manager: EntityManager) => Promise<unknown>,
      ) => {
        // Provide a minimal fake EntityManager — just enough for Object.create cloning
        const fakeTxManager = {} as EntityManager;
        return cb(fakeTxManager);
      },
    );
  }

  const fakeManager = {
    transaction: mockTransaction,
  } as unknown as EntityManager;

  const repo = Object.create(TestRepository.prototype) as TestRepository;
  (repo as unknown as { manager: EntityManager }).manager = fakeManager;

  return { repo, mockTransaction };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("BaseRepository", () => {
  describe("withRepo", () => {
    it("returns a clone of the given repo with this repo's EntityManager", () => {
      const { repo } = makeRepo();
      const otherRepo = Object.create(
        TestRepository.prototype,
      ) as TestRepository;
      const otherManager = { id: "other-manager" } as unknown as EntityManager;
      (otherRepo as unknown as { manager: EntityManager }).manager =
        otherManager;

      const cloned = repo.withRepo(otherRepo);

      // Should be a different object (clone)
      expect(cloned).not.toBe(otherRepo);
      // Should share the calling repo's manager
      expect((cloned as unknown as { manager: EntityManager }).manager).toBe(
        (repo as unknown as { manager: EntityManager }).manager,
      );
    });

    it("produces a distinct object from the source repo (is a clone)", () => {
      const { repo } = makeRepo();
      const otherRepo = Object.create(
        TestRepository.prototype,
      ) as TestRepository;

      const cloned = repo.withRepo(otherRepo);

      // withRepo uses Object.create so it must return a different reference
      expect(cloned).not.toBe(otherRepo);
      expect(cloned).not.toBe(repo);
    });
  });

  describe("tx", () => {
    it("calls manager.transaction with SERIALIZABLE isolation", async () => {
      const { repo, mockTransaction } = makeRepo();

      await repo.tx(async () => "result");

      expect(mockTransaction).toHaveBeenCalledWith(
        "SERIALIZABLE",
        expect.any(Function),
      );
    });

    it("passes a cloned repo with the transaction manager to the callback", async () => {
      const fakeTxManager = { id: "tx-manager" } as unknown as EntityManager;
      const { repo, mockTransaction } = makeRepo();

      mockTransaction.mockImplementation(
        (
          _isolation: string,
          cb: (manager: EntityManager) => Promise<unknown>,
        ) => cb(fakeTxManager),
      );

      let receivedRepo: TestRepository | undefined;
      await repo.tx(async (txRepo) => {
        receivedRepo = txRepo;
      });

      expect(receivedRepo).toBeDefined();
      expect(
        (receivedRepo as unknown as { manager: EntityManager }).manager,
      ).toBe(fakeTxManager);
    });

    it("returns the value resolved by the callback (success path)", async () => {
      const { repo } = makeRepo();

      const result = await repo.tx(async () => "committed-value");

      expect(result).toBe("committed-value");
    });

    it("re-throws the original error when the callback rejects (error path)", async () => {
      const originalError = new Error("database conflict");
      const { repo, mockTransaction } = makeRepo();

      mockTransaction.mockImplementation(
        (
          _isolation: string,
          cb: (manager: EntityManager) => Promise<unknown>,
        ) =>
          cb({} as EntityManager).catch((err: Error) => {
            throw err;
          }),
      );

      // Arrange: callback throws
      await expect(
        repo.tx(async () => {
          throw originalError;
        }),
      ).rejects.toBe(originalError);
    });

    it("propagates transaction-level errors (e.g. deadlock) from the manager", async () => {
      const deadlockError = new Error("deadlock detected");
      const { repo, mockTransaction } = makeRepo();
      mockTransaction.mockRejectedValue(deadlockError);

      await expect(repo.tx(async () => "ok")).rejects.toBe(deadlockError);
    });
  });
});
