/**
 * Boot. Connect first, migrate, then listen — in that order, so a bad
 * database is a non-zero exit rather than a server answering with empty
 * arrays.
 */

import { buildApp } from "./app";
import { connect, createPool } from "./db";
import { migrate } from "./migrate";
import { seed } from "./seed";

const PORT = Number(process.env.PORT ?? "3020");

async function main() {
  const pool = createPool();
  const db = await connect(pool);

  // node-postgres runs a multi-statement string through the simple query
  // protocol, which is exactly what a migration script needs.
  const ran = await migrate(db, (script) => pool.query(script));
  if (ran.length > 0) console.log(`api_v2: applied ${ran.join(", ")}`);

  // Additive and idempotent, so this is safe on every boot: it inserts what
  // is missing and leaves everything an author has touched alone.
  if (process.env.SEED !== "false") {
    const counts = await seed(db);
    if (counts.documents + counts.collections + counts.records > 0) {
      console.log(
        `api_v2: seeded ${counts.documents} pages, ${counts.collections} collections, ${counts.records} records`,
      );
    }
  }

  const app = buildApp({ db, logger: true });
  await app.listen({ port: PORT, host: "0.0.0.0" });
  console.log(`api_v2 listening on ${PORT}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
