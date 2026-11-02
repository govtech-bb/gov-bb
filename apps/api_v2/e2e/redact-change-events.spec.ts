import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { migrate } from "../src/migrate";
import {
  AUTH_ENV,
  DB,
  HAS_DATABASE,
  createScratchDatabase,
  dropScratchDatabase,
  runToExit,
} from "./support";

const PRIVATE_TEXT = "history-fixture-sensitive-text";
const NOTICE = { redacted: true, reason: "incident '42'", by: "operator-test" };

describe.skipIf(!HAS_DATABASE)("redact-change-events", () => {
  let database: string;
  let pool: Pool;
  let eventId: string;

  beforeEach(async () => {
    database = await createScratchDatabase();
    pool = new Pool({ ...DB, database });
    await migrate(drizzle(pool), (script) => pool.query(script));
    await pool.query(
      "insert into content_pages (url, slug, title, body_markdown) values ('/x', 'x', 'X', $1)",
      [PRIVATE_TEXT],
    );
    await pool.query("update content_pages set title = 'Another version'");
    eventId =
      (
        await pool.query<{ id: string }>(
          "select id from change_events where version_no = 1",
        )
      ).rows[0]?.id ?? expect.unreachable("Expected the page's first event");
  });

  afterEach(async () => {
    await pool.end();
    await dropScratchDatabase(database);
  });

  const args = () => [
    "--event-id",
    eventId,
    "--reason",
    NOTICE.reason,
    "--by",
    NOTICE.by,
  ];
  const run = (arguments_ = args(), env: Record<string, string> = {}) =>
    runToExit(
      {
        ...AUTH_ENV,
        DB_HOST: DB.host,
        DB_PORT: String(DB.port),
        DB_USERNAME: DB.user,
        DB_PASSWORD: DB.password,
        DB_NAME: database,
        ...env,
      },
      { script: "redact-change-events.js", args: arguments_ },
    );
  const history = async () =>
    (
      await pool.query<Record<string, unknown>>(
        "select * from change_events order by version_no",
      )
    ).rows;

  it("dry-runs by default, then replaces only the selected snapshot on apply", async () => {
    const before = await history();
    const dry = await run();
    expect(dry.code, dry.output).toBe(0);
    expect(dry.output).not.toContain(PRIVATE_TEXT);
    expect(JSON.parse(dry.output)).toMatchObject({
      mode: "dry-run",
      database,
      event: { id: eventId, version_no: 1 },
    });
    expect(await history()).toEqual(before);

    const applied = await run([...args(), "--apply"]);
    expect(applied.code, applied.output).toBe(0);
    expect(applied.output).not.toContain(PRIVATE_TEXT);
    expect(applied.output).not.toContain(DB.password);
    expect(JSON.parse(applied.output)).toMatchObject({
      mode: "apply",
      database,
      event: { id: eventId, version_no: 1 },
    });
    expect(await history()).toEqual(
      before.map((event) =>
        event.id === eventId ? { ...event, snapshot: NOTICE } : event,
      ),
    );
    expect(
      (await pool.query("select body_markdown from content_pages")).rows,
    ).toEqual([{ body_markdown: PRIVATE_TEXT }]);
  });

  it.each(["--event-id", "--reason", "--by"])(
    "requires %s before connecting",
    async (flag) => {
      const incomplete = args();
      incomplete.splice(incomplete.indexOf(flag), 2);
      const result = await run(incomplete, { DB_PORT: "1" });
      expect(result.code).toBe(1);
      expect(result.output).toContain("History redaction requires");
      expect(result.output).not.toContain("Cannot reach Postgres");
    },
  );

  it.each(["--reason", "--by"])(
    "refuses a blank %s before connecting",
    async (flag) => {
      const blank = args();
      blank[blank.indexOf(flag) + 1] = " \t\n";
      const result = await run(blank, { DB_PORT: "1" });
      expect(result.code).toBe(1);
      expect(result.output).toContain("History redaction requires");
    },
  );

  it("rejects an invalid ID without printing the supplied value", async () => {
    const invalid = args();
    invalid[1] = PRIVATE_TEXT;
    const result = await run(invalid, { DB_PORT: "1" });
    expect(result.code).toBe(1);
    expect(result.output).toContain("History redaction requires");
    expect(result.output).not.toContain(PRIVATE_TEXT);
  });

  it("does not echo an unknown command-line option", async () => {
    const result = await run([...args(), `--${PRIVATE_TEXT}`]);
    expect(result.code).toBe(1);
    expect(result.output).toContain("History redaction failed");
    expect(result.output).not.toContain(PRIVATE_TEXT);
  });

  it("refuses a missing event without changing another event", async () => {
    const before = await history();
    const missing = args();
    missing[1] = "22222222-2222-4222-8222-222222222222";
    const result = await run([...missing, "--apply"]);
    expect(result.code).toBe(1);
    expect(result.output).toContain("event_not_found");
    expect(await history()).toEqual(before);
  });

  it("refuses to rewrite an existing removal notice", async () => {
    expect((await run([...args(), "--apply"])).code).toBe(0);
    const before = await history();
    const result = await run([
      ...args(),
      "--reason",
      "Different reason",
      "--apply",
    ]);
    expect(result.code).toBe(1);
    expect(result.output).toContain("already_redacted");
    expect(await history()).toEqual(before);
  });

  it("rolls back a failed update without printing driver details", async () => {
    await pool.query(`create function fail_redaction_test() returns trigger as $$
      begin raise exception 'history-fixture-sensitive-text'; end;
      $$ language plpgsql;
      create trigger fail_redaction_test after update on change_events
      for each row execute function fail_redaction_test()`);
    const before = await history();
    const result = await run([...args(), "--apply"]);
    expect(result.code).toBe(1);
    expect(result.output).toContain("History redaction failed");
    expect(result.output).not.toContain(PRIVATE_TEXT);
    expect(result.output).not.toContain(DB.password);
    expect(await history()).toEqual(before);
  });
});
