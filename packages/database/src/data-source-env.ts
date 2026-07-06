import { DataSource, DataSourceOptions } from "typeorm";
import { readFileSync } from "node:fs";
import { createDataSource } from "./index";

// In production, verify the database server's certificate. `DB_SSL_CA` may hold
// either the PEM contents directly or a path to a PEM file — useful for
// pinning RDS regional CA bundles. If unset, Node falls back to its built-in
// trust store, which covers Amazon's public root CAs.
export function buildSslConfig() {
  if (process.env.NODE_ENV !== "production") return false;
  const ca = process.env.DB_SSL_CA;
  if (!ca) return { rejectUnauthorized: true };
  const looksLikePath = !ca.includes("BEGIN CERTIFICATE");
  return {
    rejectUnauthorized: true,
    ca: looksLikePath ? readFileSync(ca, "utf8") : ca,
  };
}

type DbEnvOptions = Omit<
  Extract<DataSourceOptions, { type: "postgres" }>,
  "entities" | "migrations"
>;

/**
 * Maps the standard `DB_*` env vars to TypeORM connection options (minus
 * entities/migrations, which the package owns). Defaults are dev-friendly so a
 * bare local Postgres works without a `.env`; production task defs set every
 * value explicitly. `overrides` win over the env-derived values.
 */
export function dbOptionsFromEnv(
  overrides: Partial<DbEnvOptions> = {},
): DbEnvOptions {
  return {
    type: "postgres",
    host: process.env.DB_HOST ?? "localhost",
    port: parseInt(process.env.DB_PORT ?? "5432", 10),
    username: process.env.DB_USERNAME ?? "postgres",
    password: process.env.DB_PASSWORD ?? "postgres",
    database: process.env.DB_NAME ?? "modular_forms",
    synchronize: process.env.DB_SYNCHRONIZE === "true",
    logging: process.env.DB_LOGGING === "true",
    ssl: buildSslConfig(),
    ...overrides,
  };
}

/** Creates a DataSource (with the package entities/migrations) from `DB_*` env. */
export function createDataSourceFromEnv(
  overrides: Partial<DbEnvOptions> = {},
): DataSource {
  return createDataSource(dbOptionsFromEnv(overrides));
}
