/**
 * Estate import (#2978):
 * `node dist/src/import-estate.js --forms-api <origin> [--dry-run] [--force "<reason>"]`.
 *
 * Runs inside the deployed image with the API's own configuration, so the
 * database, TLS and secrets are the task definition's. Before touching the
 * database it reads that environment's `service_status` from `--forms-api`
 * (api v1) and applies it to the snapshot's visibility (#3188), printing the
 * changes. Then it migrates, so a fresh database works too, and hands over to
 * `importEstate()`.
 */
import { parseArgs } from "node:util";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { parseConfig } from "./config";
import { connect, createPool } from "./db";
import { migrate } from "./migrate";
import { ESTATE } from "./seed-data";
import {
  type ServiceStatus,
  ServiceStatuses,
  applyServiceStatuses,
} from "./modules/service-status";
import { importEstate } from "./seed";

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      "dry-run": { type: "boolean", default: false },
      force: { type: "string" },
      "forms-api": { type: "string" },
    },
  });
  const formsApi = values["forms-api"];
  if (formsApi === undefined) {
    console.error(
      "--forms-api <origin> is required: the import applies that environment's service_status (api v1, GET /service_status)",
    );
    process.exitCode = 1;
    return;
  }
  const parsed = parseConfig(process.env);
  if (!parsed.ok) {
    // Field names only: the supplied values may be secrets.
    console.error(parsed.error.message, parsed.error.fields);
    process.exitCode = 1;
    return;
  }
  const config = parsed.value;

  const url = `${formsApi.replace(/\/+$/, "")}/service_status`;
  let statuses: Map<string, ServiceStatus>;
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(15_000) });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    statuses = ServiceStatuses.parse(await response.json());
  } catch (error) {
    // fetch hides the network reason in `cause` ("fetch failed").
    const { message, cause } = error as Error;
    const why = cause instanceof Error ? ` (${cause.message})` : "";
    throw new Error(`service_status: ${message}${why} from ${url}`, {
      cause: error,
    });
  }
  console.log(`service_status: ${statuses.size} rows from ${url}`);
  const { pages, changes } = applyServiceStatuses(ESTATE.pages, statuses);
  console.log(JSON.stringify({ visibility_changes: changes }));

  const created = createPool(config.database, console);
  if (!created.ok) {
    console.error(created.error.message);
    process.exitCode = 1;
    return;
  }
  const pool = created.value;
  try {
    const connected = await connect(pool, config.database);
    if (!connected.ok) {
      console.error(connected.error.message);
      process.exitCode = 1;
      return;
    }
    const db = connected.value;
    await migrate(db, (script) => pool.query(script));

    const target = await db.execute(
      sql`select current_database() as database, inet_server_addr()::text as host`,
    );
    const { database, host } = z
      .object({ database: z.string(), host: z.string().nullable() })
      .parse(target.rows[0]);
    console.log(`database: ${database} host: ${host ?? "local socket"}`);

    const report = await importEstate(db, {
      dryRun: values["dry-run"],
      force: values.force,
      estate: { ...ESTATE, pages },
    });
    const mode = values["dry-run"]
      ? "dry-run"
      : values.force !== undefined
        ? "replace"
        : "import";
    console.log(JSON.stringify({ mode, ...report }));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
