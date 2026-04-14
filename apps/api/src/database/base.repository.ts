import { Repository } from 'typeorm';

export class BaseRepository<T extends object> extends Repository<T> {
  tx<R>(cb: (repo: this) => Promise<R>): Promise<R> {
    return this.manager.transaction('SERIALIZABLE', (manager) =>
      cb(manager.withRepository(this)),
    );
  }
}
