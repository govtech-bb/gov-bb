import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";
import { getCachedSecret } from "../secrets";

export type Database = NodePgDatabase<typeof schema> & { $client: pg.Pool };
let dbPromise: Promise<Database> | null = null;

// Resolves the connection string from one of three sources, in priority:
//   1. process.env.DATABASE_URL — CLI / ingest ECS task (ECS injects from
//      Secrets Manager via the task def's `valueFrom`).
//   2. process.env.CHAT_DATABASE_URL — legacy local-dev override.
//   3. AWS Secrets Manager via CHAT_DATABASE_URL_SECRET_ARN — the SSR Lambda
//      path (issue #202). The Lambda has no plaintext DATABASE_URL env var;
//      it knows only the ARN of the secret and reads the value via
//      secretsmanager:GetSecretValue using its compute role.
async function resolveConnectionString(): Promise<string> {
  const direct = process.env.DATABASE_URL ?? process.env.CHAT_DATABASE_URL;
  if (direct) return direct;
  const arn = process.env.CHAT_DATABASE_URL_SECRET_ARN;
  if (!arn) {
    throw new Error(
      "Neither DATABASE_URL/CHAT_DATABASE_URL nor CHAT_DATABASE_URL_SECRET_ARN is set",
    );
  }
  return getCachedSecret(arn);
}

export function hasDatabase(): boolean {
  return Boolean(
    process.env.DATABASE_URL ??
    process.env.CHAT_DATABASE_URL ??
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
