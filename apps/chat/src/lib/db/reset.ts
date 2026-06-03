// Drop the rag_documents table + drizzle's migration journal. Useful when
// switching embedding providers (different vector dim requires fresh table).
// Run via `pnpm db:reset` then `pnpm db:migrate`.

import { sql } from "drizzle-orm";
import { getDb } from "./index";

async function main() {
  if (!process.argv.includes("--force")) {
    console.error(
      "[db] reset DROPS all chat tables (chunks, documents, ingest_runs,\n" +
        "rag_documents) and the drizzle schema. This is irreversible.\n" +
        "Confirm DATABASE_URL points at the right database, then re-run:\n" +
        "  pnpm db:reset --force",
    );
    process.exit(1);
  }
  const db = await getDb();
  await db.execute(sql`DROP TABLE IF EXISTS chunks CASCADE`);
  await db.execute(sql`DROP TABLE IF EXISTS documents CASCADE`);
  await db.execute(sql`DROP TABLE IF EXISTS ingest_runs CASCADE`);
  await db.execute(sql`DROP TABLE IF EXISTS rag_documents CASCADE`);
  await db.execute(sql`DROP SCHEMA IF EXISTS drizzle CASCADE`);
  console.log("[db] reset done — run pnpm db:migrate next");
  await db.$client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
