// Apply pending migrations. Run via `pnpm db:migrate`.

import { migrate } from "drizzle-orm/node-postgres/migrator";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { getDb } from "./index";
import { ENABLE_PGVECTOR } from "./schema";

const here = dirname(fileURLToPath(import.meta.url));
const migrationsFolder = join(here, "migrations");

async function main() {
  const db = await getDb();
  await db.execute(ENABLE_PGVECTOR);
  await migrate(db, { migrationsFolder });
  console.log("[db] migrations applied");
  await db.$client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
