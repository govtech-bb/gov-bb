import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

type Db = NodePgDatabase<typeof schema> & { $client: pg.Pool };
let dbPromise: Promise<Db> | null = null;

export function hasDatabase(): boolean {
  return Boolean(process.env.DATABASE_URL ?? process.env.CHAT_DATABASE_URL);
}

export function getDb(): Promise<Db> {
  if (!dbPromise) {
    dbPromise = (async () => {
      const raw = process.env.DATABASE_URL ?? process.env.CHAT_DATABASE_URL;
      if (!raw) throw new Error("DATABASE_URL not set");
      // RDS / any managed Postgres needs SSL. pg-connection-string v3 now
      // treats sslmode=require as verify-full and rejects RDS's CA chain.
      // For sandbox we accept the self-signed chain explicitly via the pool
      // `ssl` option, and strip any conflicting sslmode= from the URL so
      // the URL parser doesn't override it back to verify-full.
      const wantsSsl =
        /sslmode=(require|verify-ca|verify-full|no-verify)/.test(raw) ||
        /rds\.amazonaws\.com/.test(raw) ||
        process.env.DB_SSL === "true";
      const connectionString = wantsSsl
        ? raw
            .replace(/([?&])sslmode=[^&]*&?/, (_m, p1) =>
              p1 === "?" ? "?" : "",
            )
            .replace(/[?&]$/, "")
        : raw;
      const pool = new pg.Pool({
        connectionString,
        max: 5,
        ssl: wantsSsl ? { rejectUnauthorized: false } : undefined,
      });
      return drizzle(pool, { schema, casing: "snake_case" }) as Db;
    })();
  }
  return dbPromise;
}

export { schema };
