import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { COLLECTIONS } from "../src/seed-data/collections";
import {
  DB,
  HAS_DATABASE,
  createScratchDatabase,
  databaseQuery,
  dropScratchDatabase,
  runScript,
  runToExit,
  startServer,
  type Server,
} from "./support";

/**
 * The built `import-collections` and `scripts/check-collections.ts` (#3783)
 * against a server seeded with the real seed's collections.
 */
describe.skipIf(!HAS_DATABASE)(
  "import-collections and check-collections",
  () => {
    let server: Server;
    let database: string;
    const [first] = COLLECTIONS;
    const record = first!.records[0]![first!.record_key]!;
    const name = `${first!.key}/${record}`;

    beforeAll(async () => {
      database = await createScratchDatabase();
      server = await startServer({ DB_NAME: database, SEED: "true" });
    }, 60_000);

    afterAll(async () => {
      await server?.stop();
      if (database) await dropScratchDatabase(database);
    });

    const run = (args: string[] = []) =>
      runToExit(
        {
          DB_HOST: DB.host,
          DB_PORT: String(DB.port),
          DB_USERNAME: DB.user,
          DB_PASSWORD: DB.password,
          DB_NAME: database,
          SEED: "false",
        },
        { script: "import-collections.js", args },
      );
    const check = () =>
      runScript("scripts/check-collections.ts", ["--base-url", server.url], {});

    it("finds no difference on a seeded database, and the import writes nothing", async () => {
      const clean = await check();
      expect(clean.code, clean.output).toBe(0);
      expect(clean.output).toContain(
        `0 differences in ${COLLECTIONS.length} seed collections`,
      );

      const dry = await run(["--dry-run"]);
      expect(dry.code, dry.output).toBe(0);
      expect(dry.output).toMatch(
        new RegExp(`^database: ${database} host: `, "m"),
      );
      expect(dry.output).toContain(
        '{"mode":"dry-run","reason":null,"collections_created":0,"records_added":0,"records_skipped":0,"skipped":[],"records_replaced":0,"replaced":[]}',
      );
    });

    it("names a changed record, skips it, replaces it with --force and adds back a missing one", async () => {
      await databaseQuery(
        database,
        `update collection_records set data = data || '{"name": "Changed"}'
        where collection_key = $1 and record_key = $2`,
        [first!.key, record],
      );
      const changed = await check();
      expect(changed.code, changed.output).toBe(1);
      expect(changed.output).toContain(`${name}: record differs from the seed`);
      expect(changed.output).toContain("1 differences");

      const skipped = await run();
      expect(skipped.code, skipped.output).toBe(0);
      expect(skipped.output).toContain(
        `"mode":"import","reason":null,"collections_created":0,"records_added":0,"records_skipped":1,"skipped":["${name}"]`,
      );

      const blank = await run(["--force", " "]);
      expect(blank.code, blank.output).toBe(1);
      expect(blank.output).toContain("--force needs a reason");
      expect(blank.output).not.toContain("database:");

      await databaseQuery(
        database,
        `delete from collection_records where collection_key = $1 and record_key <> $2`,
        [first!.key, record],
      );
      const replaced = await run(["--force", "e2e restore"]);
      expect(replaced.code, replaced.output).toBe(0);
      expect(replaced.output).toContain(
        `"mode":"replace","reason":"e2e restore","collections_created":0,"records_added":${first!.records.length - 1},"records_skipped":0,"skipped":[],"records_replaced":1,"replaced":["${name}"]`,
      );

      const after = await check();
      expect(after.code, after.output).toBe(0);
      expect(after.output).toContain("0 differences");
    });

    it("refuses a field list that differs and writes nothing", async () => {
      await databaseQuery(
        database,
        `update data_collections set schema = jsonb_set(schema, '{fields,1,label}', '"Renamed"') where key = $1`,
        [first!.key],
      );
      const events = await databaseQuery(
        database,
        "select count(*)::int as n from change_events",
      );
      const refused = await run();
      expect(refused.code, refused.output).toBe(1);
      expect(refused.output).toContain(`${first!.key}: field list differs.`);
      expect(refused.output).toContain("nothing was written");
      expect(refused.output).not.toContain('"mode"');
      expect(
        await databaseQuery(
          database,
          "select count(*)::int as n from change_events",
        ),
      ).toEqual(events);
    });
  },
);
