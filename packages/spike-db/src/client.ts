import { PGlite, type PGliteInterface } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { live, type LiveNamespace } from "@electric-sql/pglite/live";
import { PGliteWorker } from "@electric-sql/pglite/worker";
import { migrate } from "./migrate";
import { seed } from "./seed";

export type SpikeDb = PGliteInterface & { live: LiveNamespace };

let clientPromise: Promise<SpikeDb> | null = null;

/**
 * The browser client: one multi-tab worker instance, migrated and seeded.
 *
 * Async by construction, which is the point. `localStorage` was the earlier
 * plan and was rejected because its synchronous API pulls code toward reads
 * in render paths and useState initialisers — the shape that would have to
 * be unpicked at every call site the day this becomes `fetch`.
 */
export function getDb(): Promise<SpikeDb> {
  clientPromise ??= (async () => {
    const db = (await PGliteWorker.create(
      new Worker(new URL("./worker.ts", import.meta.url), { type: "module" }),
      { extensions: { live } },
    )) as unknown as SpikeDb;

    // Only the leader tab should run DDL; followers wait for it to finish.
    await db.waitReady;
    await migrate(db);
    await seed(db);
    return db;
  })();
  return clientPromise;
}

/**
 * An in-memory database for tests and for the Phase 5 dump. Same schema,
 * same seed, no IndexedDB and no worker.
 */
export async function createMemoryDb(
  options: { migrate?: boolean; seed?: boolean } = {},
): Promise<PGliteInterface> {
  const db = new PGlite({ extensions: { pgcrypto } });
  await db.waitReady;
  if (options.migrate !== false) await migrate(db);
  if (options.seed !== false) await seed(db);
  return db;
}

export { live, PGlite };
