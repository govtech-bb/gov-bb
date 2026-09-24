/**
 * "Given the database is unreachable, when api_v2 starts, then it fails
 * loudly with a clear message rather than starting and serving empty
 * results" — #2700.
 *
 * Worth a test rather than trust: an API that boots without a database and
 * answers with empty arrays is indistinguishable, from the outside, from an
 * estate that genuinely has no content.
 */

import { describe, expect, it } from "vitest";
import { connect } from "./db";

describe("connect", () => {
  it("refuses to start when Postgres is unreachable, and says where it looked", async () => {
    process.env.DB_HOST = "127.0.0.1";
    process.env.DB_PORT = "1";
    process.env.DB_USERNAME = "nobody";

    // A pool object that fails the way an unreachable server fails.
    const pool = {
      query: async () => {
        throw new Error("ECONNREFUSED");
      },
    } as unknown as Parameters<typeof connect>[0];

    await expect(connect(pool)).rejects.toThrow(
      /Cannot reach Postgres at 127\.0\.0\.1:1 as nobody — refusing to start/,
    );
  });
});
