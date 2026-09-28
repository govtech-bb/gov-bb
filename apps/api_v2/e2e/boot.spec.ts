/**
 * "Given the database is unreachable, when api_v2 starts, then it fails
 * loudly with a clear message rather than starting and serving empty
 * results" — #2700.
 *
 * `src/db.test.ts` asserts the error `connect` throws. This asserts what the
 * process does with it, which is the part that matters to whoever is looking
 * at a deployment: a non-zero exit, a message naming where it looked, and
 * nothing listening. A server that boots without a database and answers with
 * empty arrays is indistinguishable, from the outside, from an estate that
 * genuinely has no content — and a health check would call it healthy.
 *
 * This one needs no Postgres. It needs there NOT to be one at the address it
 * tries, which port 1 reliably provides.
 */

import { describe, expect, it } from "vitest";
import { runToExit } from "./support";

describe("booting without a database", () => {
  it("exits non-zero and says where it looked", async () => {
    const { code, output } = await runToExit({
      DB_HOST: "127.0.0.1",
      DB_PORT: "1",
      DB_USERNAME: "nobody",
      DB_NAME: "nothing",
      PORT: "3119",
    });

    expect(code).toBe(1);
    expect(output).toContain("Cannot reach Postgres at 127.0.0.1:1 as nobody");
    expect(output).toContain("refusing to start");
  });

  it("never starts listening", async () => {
    const attempt = runToExit({
      DB_HOST: "127.0.0.1",
      DB_PORT: "1",
      DB_USERNAME: "nobody",
      DB_NAME: "nothing",
      PORT: "3118",
    });

    await expect(fetch("http://127.0.0.1:3118/pages")).rejects.toThrow();
    await attempt;
  });
});
