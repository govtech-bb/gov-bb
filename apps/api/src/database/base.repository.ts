import { EntityManager, Repository } from "typeorm";

export class BaseRepository<T extends object> extends Repository<T> {
  /**
   * Clone another BaseRepository onto this transaction's EntityManager.
   * Use instead of manager.withRepository() — that calls new Repo(manager) which
   * breaks because our constructors expect DataSource, not EntityManager.
   */
  withRepo<R extends BaseRepository<object>>(repo: R): R {
    const clone = Object.create(repo) as R;
    (clone as { manager: EntityManager }).manager = this.manager;
    return clone;
  }

  tx<R>(cb: (repo: this) => Promise<R>): Promise<R> {
    return this.manager.transaction(
      "SERIALIZABLE",
      (txManager: EntityManager) => {
        const txRepo = Object.create(this) as this;
        (txRepo as { manager: EntityManager }).manager = txManager;
        return cb(txRepo);
      },
    );
  }
}
