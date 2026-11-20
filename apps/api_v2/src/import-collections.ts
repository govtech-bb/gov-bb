/**
 * Collections import (#3783):
 * `node dist/src/import-collections.js [--dry-run] [--force "<reason>"]`.
 *
 * Runs inside the deployed image with the API's own configuration, as
 * `import-estate` does, and hands over to `importCollections()`: it adds the
 * seed's missing collections and records to a database that already has its
 * estate, and never touches pages.
 */
import { parseArgs } from "node:util";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { importCollections } from "./collection-import";
import { parseConfig } from "./config";
import { connect, createPool } from "./db";
import { migrate } from "./migrate";

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      "dry-run": { type: "boolean", default: false },
      force: { type: "string" },
    },
  });
  if (values.force !== undefined && !values.force.trim()) {
    console.error('--force needs a reason: --force "<reason>"');
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
    await migrate(pool);

    const target = await db.execute(
      sql`select current_database() as database, inet_server_addr()::text as host`,
    );
    const { database, host } = z
      .object({ database: z.string(), host: z.string().nullable() })
      .parse(target.rows[0]);
    console.log(`database: ${database} host: ${host ?? "local socket"}`);

    const report = await importCollections(db, {
      dryRun: values["dry-run"],
      force: values.force,
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
