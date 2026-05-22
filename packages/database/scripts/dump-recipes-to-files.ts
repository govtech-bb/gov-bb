#!/usr/bin/env node
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { Client } from "pg";

export type PublishedRow = {
  id: string;
  form_id: string;
  version: string;
  schema: Record<string, unknown>;
  published_at: Date | null;
  created_at: Date;
  updated_at: Date;
};

export type Logger = {
  info: (msg: string) => void;
  warn: (msg: string) => void;
  error: (msg: string) => void;
};

export type DumpSummary = {
  formsSeen: number;
  filesWritten: number;
  filesUnchanged: number;
  conflicts: number;
};

const DEFAULT_RECIPES_ROOT = path.resolve(process.cwd(), "recipes");

/**
 * Serialize a recipe to the on-disk canonical form: 2-space indented JSON
 * with a trailing newline. Must match the format used by the form_builder's
 * publish flow so subsequent runs of this script don't produce churn.
 */
function serialize(schema: Record<string, unknown>): string {
  return JSON.stringify(schema, null, 2) + "\n";
}

// Render the connection target as "<host>/<dbname>" for an operator-facing log
// line. Safe to call on any string; we never include credentials in the output.
function describeTarget(connectionString: string): string {
  try {
    const url = new URL(connectionString);
    const host = url.hostname || "(unknown host)";
    const db = url.pathname.replace(/^\//, "") || "(no dbname)";
    return `${host}/${db}`;
  } catch {
    return "(unparseable connection string)";
  }
}

/**
 * Writes the rows to `recipesRoot/{formId}/{version}.json`. Idempotent:
 *   - File missing → write, count as "written".
 *   - File exists and identical → count as "unchanged".
 *   - File exists and differs → log a warning, leave on-disk content alone,
 *     count as "conflict". The script does NOT overwrite conflicting files
 *     — the operator inspects and reconciles by hand.
 */
export async function writePublishedRecipes({
  rows,
  recipesRoot,
  logger,
}: {
  rows: PublishedRow[];
  recipesRoot: string;
  logger: Logger;
}): Promise<DumpSummary> {
  const summary: DumpSummary = {
    formsSeen: 0,
    filesWritten: 0,
    filesUnchanged: 0,
    conflicts: 0,
  };
  const formsSeen = new Set<string>();

  for (const row of rows) {
    formsSeen.add(row.form_id);
    const formDir = path.join(recipesRoot, row.form_id);
    await fs.mkdir(formDir, { recursive: true });
    const filePath = path.join(formDir, `${row.version}.json`);
    const relative = path.relative(process.cwd(), filePath);
    const desired = serialize(row.schema);

    let existing: string | null = null;
    try {
      existing = await fs.readFile(filePath, "utf8");
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
    }

    if (existing === null) {
      await fs.writeFile(filePath, desired);
      summary.filesWritten++;
      logger.info(`wrote ${relative}`);
    } else if (existing === desired) {
      summary.filesUnchanged++;
    } else {
      summary.conflicts++;
      logger.warn(
        `conflict: ${relative} on disk differs from DB row (id=${row.id}). ` +
          `Leaving on-disk content unchanged. Reconcile manually before committing.`,
      );
    }
  }

  summary.formsSeen = formsSeen.size;

  logger.info(
    `summary: ${summary.formsSeen} form(s), ${summary.filesWritten} file(s) written, ` +
      `${summary.filesUnchanged} unchanged, ${summary.conflicts} conflict(s)`,
  );

  return summary;
}

/**
 * Connect to Postgres using DATABASE_URL (or DB_HOST/DB_PORT/... fallbacks),
 * query published recipes, hand off to writePublishedRecipes.
 */
async function runDump({
  recipesRoot,
  logger,
}: {
  recipesRoot: string;
  logger: Logger;
}): Promise<DumpSummary> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      "DATABASE_URL is required. Set it to the target Postgres connection string " +
        "(e.g. postgres://user:pass@host:5432/dbname). Use staging first, then prod.",
    );
  }

  const ssl =
    process.env.DATABASE_SSL === "true"
      ? { rejectUnauthorized: false }
      : undefined;

  const client = new Client({ connectionString, ssl });
  await client.connect();
  logger.info(`connected to database ${describeTarget(connectionString)}`);

  try {
    const result = await client.query<PublishedRow>(
      `SELECT id, form_id, version, schema, published_at, created_at, updated_at
       FROM form_definitions
       WHERE published_at IS NOT NULL
       ORDER BY form_id ASC, version ASC`,
    );
    logger.info(`fetched ${result.rows.length} published row(s)`);
    return await writePublishedRecipes({
      rows: result.rows,
      recipesRoot,
      logger,
    });
  } finally {
    await client.end();
  }
}

async function main(): Promise<void> {
  const consoleLogger: Logger = {
    info: (m) => console.log(m),
    warn: (m) => console.warn(m),
    error: (m) => console.error(m),
  };

  const summary = await runDump({
    recipesRoot: DEFAULT_RECIPES_ROOT,
    logger: consoleLogger,
  });

  if (summary.conflicts > 0) {
    consoleLogger.warn(
      `Completed with ${summary.conflicts} conflict(s). Review the warnings above ` +
        `and reconcile on-disk files with the DB before committing.`,
    );
  }
}

// Run main() only when executed directly, not when imported by tests.
if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
