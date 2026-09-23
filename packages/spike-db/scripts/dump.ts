/**
 * Phase 5: prove the spike's database is portable.
 *
 * Boots PGlite in memory, migrates and seeds it exactly as the app does,
 * then runs pg_dump — the real thing, compiled to WASM — and writes plain
 * SQL. That file is the concrete artefact Sprint 1 gets handed: if it
 * restores into a stock Postgres with no manual correction, then the
 * schema, the constraints, the enum types, the trigger and every row all
 * transfer.
 *
 * `dumpDataDir` was the brief's suggestion. It produces a tarball of PGDATA,
 * which only a server of the same major version and build can open, so it
 * proves portability of the bytes rather than of the schema. A SQL dump is
 * what actually hands over.
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { pgDump } from "@electric-sql/pglite-tools/pg_dump";
import { createMemoryDb } from "../src/client";

const db = await createMemoryDb();

// One change_events row per page, so the restored database has something
// for the append-only trigger to be tested against on the far side.
await db.query(
  `insert into change_events (entity_kind, entity_id, version_no, action, snapshot)
   select 'content_page', id::text, 1, 'created', to_jsonb(content_pages)
     from content_pages`,
);

const dump = await pgDump({
  pg: db as never,
  args: ["--no-owner", "--no-acl"],
});
const sql = await dump.text();

const out = join(import.meta.dirname, "../dump.sql");
writeFileSync(out, sql);
console.log(`wrote ${out} (${(sql.length / 1024).toFixed(0)} KB)`);
process.exit(0);
