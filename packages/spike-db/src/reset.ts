import type { PGliteInterface } from "@electric-sql/pglite";
import { migrate } from "./migrate";
import { seed } from "./seed";

/**
 * Drop, migrate, reseed. The trigger has to go before the tables it guards,
 * and `drop schema public cascade` takes the enum types with it.
 */
export async function reset(db: PGliteInterface): Promise<void> {
  await db.exec(`
    drop schema public cascade;
    create schema public;
  `);
  await migrate(db);
  await seed(db);
}
