import { defineConfig } from "vitest/config";
import { alias } from "./vitest.shared";

/**
 * The end-to-end suite: the built server, on a socket, against a real
 * Postgres.
 *
 * A config of its own rather than a merge of the unit one, so `include` is
 * replaced rather than appended to — merging would run every unit test again
 * under a 60-second timeout and call the result "e2e".
 *
 * It is a different bargain from the unit suite. That one runs anywhere and
 * gates CI; this one needs a database and proves what PGlite cannot — that
 * the DDL runs on a real server, that `timestamptz(3)` round-trips through
 * the node-postgres driver rather than through WASM that happens to round the
 * same way, and that the process boots and serves over HTTP rather than only
 * through `app.inject`.
 *
 * The parts that need a database skip themselves when `DB_HOST` is unset, so
 * `nx run api_v2:e2e` is honest on a laptop with no Postgres running instead
 * of failing on infrastructure.
 */
export default defineConfig({
  resolve: { alias },
  test: {
    include: ["e2e/**/*.spec.ts"],
    testTimeout: 60_000,
    hookTimeout: 60_000,
    // One database, one server, shared by the files in order.
    fileParallelism: false,
  },
});
