/**
 * The connection, from the same `DB_*` variables every other service in this
 * repo reads — no bespoke connection config, per #2700. `packages/database`'s
 * `data-source-env.ts` is the reference; this is the Drizzle spelling of it.
 */

import { readFileSync } from "node:fs";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

/**
 * In production, verify the server's certificate. `DB_SSL_CA` may hold the PEM
 * contents directly or a path to one — RDS regional bundles are usually
 * supplied as a path. Unset falls back to Node's trust store, which covers
 * Amazon's public roots.
 */
function sslConfig() {
  if (process.env.NODE_ENV !== "production") return false;
  const ca = process.env.DB_SSL_CA;
  if (!ca) return { rejectUnauthorized: true };
  const looksLikePath = !ca.includes("BEGIN CERTIFICATE");
  return {
    rejectUnauthorized: true,
    ca: looksLikePath ? readFileSync(ca, "utf8") : ca,
  };
}

export function createPool(): Pool {
  return new Pool({
    host: process.env.DB_HOST ?? "localhost",
    port: Number(process.env.DB_PORT ?? "5432"),
    user: process.env.DB_USERNAME ?? "postgres",
    password: process.env.DB_PASSWORD ?? "postgres",
    database: process.env.DB_NAME ?? "gov_bb_v2",
    ssl: sslConfig(),
  });
}

/**
 * Connect, or refuse to start.
 *
 * A server that boots without a database and serves empty arrays is worse
 * than one that does not boot: the pages look like they exist and have no
 * content, and nothing upstream can tell that apart from a genuinely empty
 * estate. So this throws, and `main.ts` exits non-zero.
 */
export async function connect(pool: Pool) {
  try {
    await pool.query("select 1");
  } catch (cause) {
    throw new Error(
      `Cannot reach Postgres at ${process.env.DB_HOST ?? "localhost"}:${
        process.env.DB_PORT ?? "5432"
      } as ${process.env.DB_USERNAME ?? "postgres"} — refusing to start. ` +
        `Set DB_HOST, DB_PORT, DB_USERNAME, DB_PASSWORD and DB_NAME.`,
      { cause },
    );
  }
  return drizzle(pool, { schema });
}
