import { DataSource } from "typeorm";
import { entities, migrations } from "@govtech-bb/database";
import * as dotenv from "dotenv";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

dotenv.config({ path: resolve(__dirname, "../../.env") });

// In production, verify the database server's certificate. `DB_SSL_CA` may hold
// either the PEM contents directly or a path to a PEM file — useful for
// pinning RDS regional CA bundles. If unset, Node falls back to its built-in
// trust store, which covers Amazon's public root CAs.
function buildSslConfig() {
  if (process.env.NODE_ENV !== "production") return false;
  const ca = process.env.DB_SSL_CA;
  if (!ca) return { rejectUnauthorized: true };
  const looksLikePath = !ca.includes("BEGIN CERTIFICATE");
  return {
    rejectUnauthorized: true,
    ca: looksLikePath ? readFileSync(ca, "utf8") : ca,
  };
}

export const AppDataSource = new DataSource({
  type: "postgres",
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT ?? "5432", 10),
  username: process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  synchronize: process.env.DB_SYNCHRONIZE === "true",
  logging: process.env.DB_LOGGING === "true",
  ssl: buildSslConfig(),
  // The shared package is the single source of truth for entities and
  // migrations (#721) — explicit arrays, no globs.
  entities,
  migrations,
});
