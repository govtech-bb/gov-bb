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
  it("dry-runs, imports once, then refuses", async () => {
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

      const dry = await run(["--dry-run"]);
      expect(dry.code, dry.output).toBe(0);
      expect(dry.output).toContain('"mode":"dry-run"');
      expect(dry.output).toContain('"existing":0');

      const real = await run();
      expect(real.code, real.output).toBe(0);
      expect(real.output).toContain('"mode":"import"');

      const again = await run();
      expect(again.code, again.output).toBe(1);
      expect(again.output).toContain("refusing");
    } finally {
      await dropScratchDatabase(database);
    }
  }, 90_000);
});
