import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";
import { getCachedSecret } from "../secrets";

type Db = NodePgDatabase<typeof schema> & { $client: pg.Pool };
let dbPromise: Promise<Db> | null = null;

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

export function getDb(): Promise<Db> {
  if (!dbPromise) {
    dbPromise = (async () => {
      const raw = await resolveConnectionString();
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
      // rejectUnauthorized:false accepts RDS's self-signed chain (sandbox). To
      // enforce certificate verification in production, set
      // DB_SSL_REJECT_UNAUTHORIZED=true with the RDS CA trusted by Node (e.g.
      // NODE_EXTRA_CA_CERTS). Defaults to the prior behaviour so deployments
      // that don't yet bundle the CA keep connecting.
      const rejectUnauthorized =
        process.env.DB_SSL_REJECT_UNAUTHORIZED === "true";
      const pool = new pg.Pool({
        connectionString,
        max: 5,
        ssl: wantsSsl ? { rejectUnauthorized } : undefined,
      });
      return drizzle(pool, { schema, casing: "snake_case" }) as Db;
    })();
  }
  return dbPromise;
}

export { schema };
