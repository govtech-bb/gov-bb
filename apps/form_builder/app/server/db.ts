import "reflect-metadata";
import { createDataSource } from "@govtech-bb/database";
import type { DataSource } from "typeorm";
import type { PostgresConnectionOptions } from "typeorm/driver/postgres/PostgresConnectionOptions.js";

let _dataSource: DataSource | null = null;

export async function getDataSource(): Promise<DataSource> {
  if (_dataSource?.isInitialized) return _dataSource;
  const config: Omit<PostgresConnectionOptions, "entities" | "migrations"> = {
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
  };
  const ds = createDataSource(config as any);
  await ds.initialize();
  _dataSource = ds;
  return ds;
}
