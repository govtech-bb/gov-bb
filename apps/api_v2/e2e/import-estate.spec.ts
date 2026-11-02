import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { describe, expect, it } from "vitest";
import {
  AUTH_ENV,
  DB,
  HAS_DATABASE,
  createScratchDatabase,
  dropScratchDatabase,
  runToExit,
} from "./support";

describe.skipIf(!HAS_DATABASE)("import-estate", () => {
  it("applies service_status, dry-runs, imports once, then refuses", async () => {
    // api v1's GET /service_status, disabling a public page's service.
    let fail = false;
    const stub = createServer((request, response) => {
      if (fail || request.url !== "/service_status") {
        response.writeHead(500).end();
        return;
      }
      response.writeHead(200, { "content-type": "application/json" }).end(
        JSON.stringify({
          status: "success",
          data: [{ slug: "get-birth-certificate", status: "disabled" }],
        }),
      );
    });
    await new Promise<void>((resolve) => stub.listen(0, "127.0.0.1", resolve));
    const formsApi = `http://127.0.0.1:${(stub.address() as AddressInfo).port}`;
    const database = await createScratchDatabase();
    try {
      const env = {
        ...AUTH_ENV,
        DB_HOST: DB.host,
        DB_PORT: String(DB.port),
        DB_USERNAME: DB.user,
        DB_PASSWORD: DB.password,
        DB_NAME: database,
        SEED: "false",
      };
      const run = (args: string[] = []) =>
        runToExit(env, { script: "import-estate.js", args });

      const noFlag = await run(["--dry-run"]);
      expect(noFlag.code, noFlag.output).toBe(1);
      expect(noFlag.output).toContain("--forms-api");

      fail = true;
      const unreadable = await run(["--forms-api", formsApi]);
      expect(unreadable.code, unreadable.output).toBe(1);
      expect(unreadable.output).toContain("service_status: HTTP 500");
      expect(unreadable.output).not.toContain('"mode"');
      fail = false;

      const dry = await run(["--dry-run", "--forms-api", formsApi]);
      expect(dry.code, dry.output).toBe(0);
      expect(dry.output).toContain('"visibility_changes":[{"url":');
      expect(dry.output).toContain('"mode":"dry-run"');
      expect(dry.output).toContain('"existing":0');

      const real = await run(["--forms-api", `${formsApi}/`]);
      expect(real.code, real.output).toBe(0);
      expect(real.output).toContain('"mode":"import"');

      const again = await run(["--forms-api", formsApi]);
      expect(again.code, again.output).toBe(1);
      expect(again.output).toContain("refusing");
      expect(again.output.indexOf('"visibility_changes"')).toBeGreaterThan(-1);
      expect(again.output.indexOf('"visibility_changes"')).toBeLessThan(
        again.output.indexOf("refusing"),
      );
    } finally {
      await dropScratchDatabase(database);
      await new Promise((resolve) => stub.close(resolve));
    }
  }, 90_000);
});
