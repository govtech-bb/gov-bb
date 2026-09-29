import { defineConfig } from "vitest/config";

/**
 * The end-to-end suite: the built server, on a socket, against a throwaway
 * api_v2.
 *
 * A config of its own rather than a merge of the unit one, so `include` is
 * replaced rather than appended to, and with no plugins: the spec is plain
 * Node talking HTTP to another process, and never imports the app.
 *
 * It proves what the unit suite cannot. That one runs the loaders as plain
 * functions and sees what they throw; this one sees the status a citizen
 * gets, which Start, the router and the root route's middleware decide
 * between them only in a running server — a 503 on a page when api_v2
 * answers 5xx or can't be reached, and on the RPC when it answers 5xx, with
 * nothing widened beyond that.
 */
export default defineConfig({
  test: {
    include: ["e2e/**/*.spec.ts"],
    testTimeout: 60_000,
    hookTimeout: 60_000,
    // Each file boots server processes of its own; one file at a time keeps
    // a boot from racing its 30-second wait on a busy machine.
    fileParallelism: false,
  },
});
