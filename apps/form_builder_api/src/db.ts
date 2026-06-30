import { createDataSourceFromEnv } from "@govtech-bb/database";
import type { DataSource } from "typeorm";

let _dataSource: DataSource | null = null;
let _initPromise: Promise<DataSource> | null = null;

export function getDataSource(): Promise<DataSource> {
  if (_dataSource?.isInitialized) return Promise.resolve(_dataSource);
  if (_initPromise) return _initPromise;
  _initPromise = (async () => {
    const ds = createDataSourceFromEnv();
    try {
      await ds.initialize();
    } catch (err) {
      _initPromise = null;
      throw err;
    }
    _dataSource = ds;
    return ds;
  })();
  return _initPromise;
}
