import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import pg from "pg";
import { getCachedSecretString, getSecretJson } from "@govtech-bb/aws-secrets";
import * as schema from "./schema";

export type Database = NodePgDatabase<typeof schema> & { $client: pg.Pool };
let dbPromise: Promise<Database> | null = null;

const POOL_TUNING = {
  max: 5,
  // Bound the retrieval path: search() takes no abort signal, so a hung query
  // or unreachable host must not pin a turn. Postgres cancels a statement past
  // statement_timeout; connectionTimeoutMillis fails fast with no connection.
  statement_timeout: 8000,
  connectionTimeoutMillis: 5000,
} satisfies Partial<pg.PoolConfig>;

// Managed Postgres (RDS) needs SSL. pg-connection-string v3 treats
// sslmode=require as verify-full and rejects RDS's CA chain, so we strip a
// conflicting sslmode= from the URL and drive SSL via the pool `ssl` option.
// rejectUnauthorized defaults false (accepts RDS's chain for sandbox); set
// DB_SSL_REJECT_UNAUTHORIZED=true once the CA is trusted.
function sslForUrl(
  raw: string,
): Pick<pg.PoolConfig, "connectionString" | "ssl"> {
  const wantsSsl =
    /sslmode=(require|verify-ca|verify-full|no-verify)/.test(raw) ||
    /rds\.amazonaws\.com/.test(raw) ||
    process.env.DB_SSL === "true";
  const connectionString = wantsSsl
    ? raw
        .replace(/([?&])sslmode=[^&]*&?/, (_m, p1) => (p1 === "?" ? "?" : ""))
        .replace(/[?&]$/, "")
    : raw;
  return {
    connectionString,
    ssl: wantsSsl
      ? {
          rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED === "true",
        }
      : undefined,
  };
}

// Resolves the pool config, in priority:
//   1. process.env.DATABASE_URL — CLI / ingest ECS task (ECS injects from
//      Secrets Manager via the task def's `valueFrom`).
//   2. process.env.CHAT_DATABASE_URL — legacy local-dev override.
//   3. CHAT_DATABASE_CREDENTIALS_SECRET_ARN (+ HOST/PORT/NAME) — preferred SSR
//      Lambda path. The ARN points at RDS's master secret (JSON
//      `{username, password}`); host/port/dbname are non-secret and baked at
//      build via Vite's `define`. The password is a function: pg calls it for
//      each NEW physical connection, so an RDS master-password rotation is
//      picked up on the next connection with no redeploy and no pool teardown.
//      Live connections keep working — Postgres doesn't re-auth open sessions.
//   4. CHAT_DATABASE_URL_SECRET_ARN — legacy fallback. ARN of a derived secret
//      holding a full `postgresql://...` URL; does not self-heal on rotation
//      (no per-connection re-resolve). Kept during the transition.
async function resolvePoolConfig(): Promise<pg.PoolConfig> {
  const direct = process.env.DATABASE_URL ?? process.env.CHAT_DATABASE_URL;
  if (direct) return { ...POOL_TUNING, ...sslForUrl(direct) };

  const credsArn = process.env.CHAT_DATABASE_CREDENTIALS_SECRET_ARN;
  const host = process.env.CHAT_DATABASE_HOST;
  const port = process.env.CHAT_DATABASE_PORT;
  const database = process.env.CHAT_DATABASE_NAME;
  if (credsArn && host && port && database) {
    const { username } = await getSecretJson<{ username: string }>(credsArn);
    return {
      ...POOL_TUNING,
      host,
      port: Number(port),
      database,
      user: username,
      // ponytail: uncached fetch per new connection — bounded by pool churn
      // (max 5, long-lived conns), so a handful of GetSecretValue calls over a
      // container's life. Add a short TTL only if SM cost/throttling shows up.
      password: async () =>
        (await getSecretJson<{ password: string }>(credsArn)).password,
      ssl: {
        rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED === "true",
      },
    };
  }

  const arn = process.env.CHAT_DATABASE_URL_SECRET_ARN;
  if (!arn) {
    throw new Error(
      "Neither DATABASE_URL/CHAT_DATABASE_URL, CHAT_DATABASE_CREDENTIALS_SECRET_ARN (+ HOST/PORT/NAME), nor CHAT_DATABASE_URL_SECRET_ARN is set",
    );
  }
  return { ...POOL_TUNING, ...sslForUrl(await getCachedSecretString(arn)) };
}

// `||` not `??` — Vite's `define` block in apps/chat/vite.config.ts bakes a
// literal empty string for any env var that's missing in the build
// environment (its `pick()` returns `""` as the fallback). Empty string is
// NOT nullish, so `??` short-circuits at the first empty-baked var and
// silently skips the rest of the chain — which broke chat in any deploy env
// that set only the legacy URL_SECRET_ARN without also setting the
// credentials-path vars (see #1631 revert; regression test below).
export function hasDatabase(): boolean {
  return Boolean(
    process.env.DATABASE_URL ||
    process.env.CHAT_DATABASE_URL ||
    process.env.CHAT_DATABASE_CREDENTIALS_SECRET_ARN ||
    process.env.CHAT_DATABASE_URL_SECRET_ARN,
  );
}

export function getDb(): Promise<Database> {
  if (!dbPromise) {
    dbPromise = (async () => {
      const pool = new pg.Pool(await resolvePoolConfig());
      return drizzle(pool, { schema, casing: "snake_case" }) as Database;
    })();
  }
  return dbPromise;
}

export { schema };
