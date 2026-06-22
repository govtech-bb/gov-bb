import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import pg from "pg";
import {
  getCachedSecretJson,
  getCachedSecretString,
} from "@govtech-bb/aws-secrets";
import * as schema from "./schema";

export type Database = NodePgDatabase<typeof schema> & { $client: pg.Pool };
let dbPromise: Promise<Database> | null = null;

// Resolves the connection string, in priority:
//   1. process.env.DATABASE_URL — CLI / ingest ECS task (ECS injects from
//      Secrets Manager via the task def's `valueFrom`).
//   2. process.env.CHAT_DATABASE_URL — legacy local-dev override.
//   3. CHAT_DATABASE_CREDENTIALS_SECRET_ARN (+ HOST/PORT/NAME) — preferred
//      SSR Lambda path. The ARN points at RDS's master secret (JSON
//      `{username, password}`); host/port/dbname are non-secret and baked
//      at build via Vite's `define`. RDS owns the password, so any rotation
//      is picked up by the next request that misses the in-process cache —
//      no derived secret to keep in sync via `tofu apply`.
//   4. CHAT_DATABASE_URL_SECRET_ARN — legacy fallback. ARN of a derived
//      secret holding a full `postgresql://...` URL. Kept during the
//      transition; remove once #3 is wired in all envs.
async function resolveConnectionString(): Promise<string> {
  const direct = process.env.DATABASE_URL ?? process.env.CHAT_DATABASE_URL;
  if (direct) return direct;

  const credsArn = process.env.CHAT_DATABASE_CREDENTIALS_SECRET_ARN;
  const host = process.env.CHAT_DATABASE_HOST;
  const port = process.env.CHAT_DATABASE_PORT;
  const dbName = process.env.CHAT_DATABASE_NAME;
  if (credsArn && host && port && dbName) {
    const creds = await getCachedSecretJson<{
      username: string;
      password: string;
    }>(credsArn);
    return `postgresql://${creds.username}:${encodeURIComponent(creds.password)}@${host}:${port}/${dbName}?sslmode=require`;
  }

  const arn = process.env.CHAT_DATABASE_URL_SECRET_ARN;
  if (!arn) {
    throw new Error(
      "Neither DATABASE_URL/CHAT_DATABASE_URL, CHAT_DATABASE_CREDENTIALS_SECRET_ARN (+ HOST/PORT/NAME), nor CHAT_DATABASE_URL_SECRET_ARN is set",
    );
  }
  return getCachedSecretString(arn);
}

export function hasDatabase(): boolean {
  return Boolean(
    process.env.DATABASE_URL ??
    process.env.CHAT_DATABASE_URL ??
    process.env.CHAT_DATABASE_CREDENTIALS_SECRET_ARN ??
    process.env.CHAT_DATABASE_URL_SECRET_ARN,
  );
}

export function getDb(): Promise<Database> {
  if (!dbPromise) {
    dbPromise = (async () => {
      const raw = await resolveConnectionString();
      // Managed Postgres (RDS) needs SSL. pg-connection-string v3 treats
      // sslmode=require as verify-full and rejects RDS's CA chain, so we drive
      // SSL via the pool `ssl` option and strip a conflicting sslmode= from the
      // URL. rejectUnauthorized defaults false (accepts RDS's chain for
      // sandbox); set DB_SSL_REJECT_UNAUTHORIZED=true once the CA is trusted.
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
      const rejectUnauthorized =
        process.env.DB_SSL_REJECT_UNAUTHORIZED === "true";
      const pool = new pg.Pool({
        connectionString,
        max: 5,
        ssl: wantsSsl ? { rejectUnauthorized } : undefined,
        // Bound the retrieval path: search() takes no abort signal, so a hung
        // query or unreachable host must not pin a turn. Postgres cancels a
        // statement running past statement_timeout; connectionTimeoutMillis
        // fails fast when no connection is available.
        statement_timeout: 8000,
        connectionTimeoutMillis: 5000,
      });
      return drizzle(pool, { schema, casing: "snake_case" }) as Database;
    })();
  }
  return dbPromise;
}

export { schema };
