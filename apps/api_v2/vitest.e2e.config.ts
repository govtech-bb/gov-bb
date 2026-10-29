import { defineConfig } from "vitest/config";

/**
 * The end-to-end suite: the built server, on a socket, against a real
 * Postgres.
 *
 * A config of its own rather than a merge of the unit one, so `include` is
 * replaced rather than appended to — merging would run every unit test again
 * under a 60-second timeout and call the result "e2e".
 *
 * It is a different bargain from the unit suite, which goes through
 * `app.inject`. This one proves what that cannot — that the built server
 * runs the DDL, boots, and serves over HTTP on a real socket.
 *
 * The parts that need a database skip themselves when `DB_HOST` is unset, so
 * `nx run api_v2:e2e` is honest on a laptop with no Postgres running instead
 * of failing on infrastructure. CI's Test job runs it against its Postgres
 * service and fails on any skipped test (#3137), so a skip never passes there.
 */
export default defineConfig({
  test: {
    include: ["e2e/**/*.spec.ts"],
    testTimeout: 60_000,
    hookTimeout: 60_000,
    // One database, one server, shared by the files in order.
    fileParallelism: false,
  },
});
