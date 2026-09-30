/**
 * Boot. Connect first, migrate, then listen — in that order, so a bad
 * database is a non-zero exit rather than a server answering with empty
 * arrays.
 */

import pino from "pino";
import { buildApp } from "./app";
import { connect, createPool } from "./db";
import { migrate } from "./migrate";
import { seed } from "./seed";

const PORT = Number(process.env.PORT ?? "3020");

async function main() {
  // One logger for the pool and the app, so a dropped connection lands in the
  // same structured stream as the request logs. The pool exists before the
  // app does, which is why it is made here rather than by Fastify.
  const logger = pino();
  const pool = createPool(logger);
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

  const app = await buildApp({ db, logger });
  await app.listen({ port: PORT, host: "0.0.0.0" });
  console.log(`api_v2 listening on ${PORT}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
