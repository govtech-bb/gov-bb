import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";

/** `apps/simple_mock_api/data/content.db`, whatever the working directory, so
 *  `seed` and `dev` always open the same file. */
export const DEFAULT_DB_PATH = fileURLToPath(
  new URL("../data/content.db", import.meta.url),
);

export function openDb(path: string): DatabaseSync {
  if (path !== ":memory:") {
    mkdirSync(dirname(path), { recursive: true });
  }

  const db = new DatabaseSync(path);

  db.exec(`
    CREATE TABLE IF NOT EXISTS pages (
      slug TEXT PRIMARY KEY,
      url TEXT UNIQUE NOT NULL,
      visibility TEXT NOT NULL,
      frontmatter TEXT NOT NULL,
      body_markdown TEXT NOT NULL,
      hast TEXT NOT NULL,
      compiler_version TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS forms (
      form_id TEXT PRIMARY KEY,
      visibility TEXT NOT NULL
    );
  `);

  return db;
}
