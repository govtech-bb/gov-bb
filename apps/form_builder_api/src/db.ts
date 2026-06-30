import { createDataSource } from "@govtech-bb/database";
import type { DataSource } from "typeorm";

let _dataSource: DataSource | null = null;
let _initPromise: Promise<DataSource> | null = null;

export function getDataSource(): Promise<DataSource> {
  if (_dataSource?.isInitialized) return Promise.resolve(_dataSource);
  if (_initPromise) return _initPromise;
  _initPromise = (async () => {
    const ds = createDataSource({
      type: "postgres",
      host: process.env.DB_HOST ?? "localhost",
      port: parseInt(process.env.DB_PORT ?? "5432", 10),
      username: process.env.DB_USERNAME ?? "postgres",
      password: process.env.DB_PASSWORD ?? "postgres",
      database: process.env.DB_NAME ?? "modular_forms",
      synchronize: process.env.DB_SYNCHRONIZE === "true",
      logging: process.env.DB_LOGGING === "true",
      ssl:
        process.env.NODE_ENV === "production"
          ? { rejectUnauthorized: false }
          : false,
    } as any);
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
