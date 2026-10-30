/** Explicit search rebuild: check by default; --apply replaces chunks, never page content. */
import { parseArgs } from "node:util";
import { reindexSearchChunks } from "./adapters/reindex-search";
import { parseConfig } from "./config";
import { connect, createPool } from "./db";

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: { apply: { type: "boolean", default: false } },
  });
  const parsed = parseConfig(process.env);
  if (!parsed.ok) {
    console.error(parsed.error.message, parsed.error.fields);
    process.exitCode = 1;
    return;
  }
  const created = createPool(parsed.value.database, console);
  if (!created.ok) {
    console.error(created.error.message);
    process.exitCode = 1;
    return;
  }
  const pool = created.value;
  try {
    const connected = await connect(pool, parsed.value.database);
    if (!connected.ok) {
      console.error(connected.error.message);
      process.exitCode = 1;
      return;
    }
    const mode = values.apply ? "apply" : "check";
    const result = await reindexSearchChunks(connected.value, mode);
    if (!result.ok) {
      console.error(result.error.message);
      process.exitCode = 1;
      return;
    }
    console.log(JSON.stringify({ mode, ...result.value }));
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
