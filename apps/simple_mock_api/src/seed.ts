import { fileURLToPath } from "node:url";
import { openDb } from "./db.js";
import { seed } from "./seed/index.js";

const DB_PATH = process.env.DB_PATH ?? "data/content.db";
const SEED_DIR = fileURLToPath(new URL("../seed", import.meta.url));

const db = openDb(DB_PATH);

try {
  const { pages, forms } = await seed(db, SEED_DIR);
  console.log(`${pages} pages, ${forms} forms`);
} catch (err) {
  console.error((err as Error).message);
  process.exit(1);
}
