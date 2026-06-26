import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import {
  buildConnectionString,
  writePublishedRecipes,
  type PublishedRow,
} from "./dump-recipes-to-files";

const FIXTURES_ROOT = path.join(__dirname, "__fixtures__");

async function loadFixture(name: string): Promise<PublishedRow> {
  const raw = await fs.readFile(path.join(FIXTURES_ROOT, name), "utf8");
  const parsed = JSON.parse(raw) as {
    id: string;
    form_id: string;
    version: string;
    schema: Record<string, unknown>;
  };
  return {
    id: parsed.id,
    form_id: parsed.form_id,
    version: parsed.version,
    schema: parsed.schema,
  };
}

function createSpyLogger() {
  const logs: { level: "info" | "warn" | "error"; message: string }[] = [];
  return {
    logs,
    info: (msg: string) => logs.push({ level: "info", message: msg }),
    warn: (msg: string) => logs.push({ level: "warn", message: msg }),
    error: (msg: string) => logs.push({ level: "error", message: msg }),
  };
}

describe("writePublishedRecipes", () => {
  let tempRoots: string[];

  beforeEach(() => {
    tempRoots = [];
  });

  afterEach(async () => {
    for (const r of tempRoots) {
      await fs.rm(r, { recursive: true, force: true });
    }
  });

  async function newRoot(): Promise<string> {
    const r = await fs.mkdtemp(path.join(os.tmpdir(), "dump-recipes-test-"));
    tempRoots.push(r);
    return r;
  }

  it("writes a single published row to recipes/{formId}.json", async () => {
    const root = await newRoot();
    const row = await loadFixture("published-row.json");
    const logger = createSpyLogger();

    const summary = await writePublishedRecipes({
      rows: [row],
      recipesRoot: root,
      logger,
    });

    const expectedPath = path.join(root, "passport-renewal.json");
    const written = await fs.readFile(expectedPath, "utf8");

    expect(written).toBe(JSON.stringify(row.schema, null, 2) + "\n");
    expect(summary).toEqual({
      formsSeen: 1,
      filesWritten: 1,
      filesUnchanged: 0,
      conflicts: 0,
    });
  });

  it("collapses rows of the same form to one flat file (later differing rows are conflicts)", async () => {
    // Post-M2 there is one row per formId; this guards the flat-write behaviour
    // if two rows for a form are ever passed — first wins on disk, the second is
    // a conflict (never silently overwritten).
    const root = await newRoot();
    const rows = [
      await loadFixture("published-row.json"),
      await loadFixture("published-row-v2.json"),
    ];
    const logger = createSpyLogger();

    const summary = await writePublishedRecipes({
      rows,
      recipesRoot: root,
      logger,
    });

    const written = await fs.readFile(
      path.join(root, "passport-renewal.json"),
      "utf8",
    );

    expect(JSON.parse(written).version).toBe("1.0.0"); // first row wins on disk
    expect(summary.filesWritten).toBe(1);
    expect(summary.conflicts).toBe(1);
    expect(summary.formsSeen).toBe(1);
  });

  it("is idempotent: running twice produces no net changes", async () => {
    const root = await newRoot();
    const row = await loadFixture("published-row.json");
    const logger1 = createSpyLogger();
    const logger2 = createSpyLogger();

    await writePublishedRecipes({
      rows: [row],
      recipesRoot: root,
      logger: logger1,
    });
    const firstContent = await fs.readFile(
      path.join(root, "passport-renewal.json"),
      "utf8",
    );

    const summary2 = await writePublishedRecipes({
      rows: [row],
      recipesRoot: root,
      logger: logger2,
    });
    const secondContent = await fs.readFile(
      path.join(root, "passport-renewal.json"),
      "utf8",
    );

    expect(secondContent).toBe(firstContent);
    expect(summary2).toEqual({
      formsSeen: 1,
      filesWritten: 0,
      filesUnchanged: 1,
      conflicts: 0,
    });
  });

  it("warns (does not throw) when on-disk content differs from DB content", async () => {
    const root = await newRoot();
    const row = await loadFixture("published-row.json");
    const logger = createSpyLogger();

    // Pre-write a file with deliberately different content.
    const targetPath = path.join(root, "passport-renewal.json");
    await fs.writeFile(
      targetPath,
      JSON.stringify(
        { formId: "passport-renewal", title: "STALE", version: "1.0.0" },
        null,
        2,
      ) + "\n",
    );

    const summary = await writePublishedRecipes({
      rows: [row],
      recipesRoot: root,
      logger,
    });

    // Content should NOT be overwritten on a conflict.
    const after = await fs.readFile(targetPath, "utf8");
    expect(after).toContain("STALE");

    expect(summary.conflicts).toBe(1);
    expect(summary.filesWritten).toBe(0);

    const warnings = logger.logs.filter((l) => l.level === "warn");
    expect(warnings.length).toBeGreaterThanOrEqual(1);
    expect(warnings[0].message).toMatch(/passport-renewal\.json/);
    expect(warnings[0].message.toLowerCase()).toMatch(/diff|differs|conflict/);
  });

  it("writes the flat file directly under recipesRoot (no per-form subdir)", async () => {
    const root = await newRoot();
    const row = await loadFixture("published-row.json");
    const logger = createSpyLogger();

    await writePublishedRecipes({ rows: [row], recipesRoot: root, logger });

    const stat = await fs.stat(path.join(root, "passport-renewal.json"));
    expect(stat.isFile()).toBe(true);
  });

  it("handles an empty rows array as a no-op", async () => {
    const root = await newRoot();
    const logger = createSpyLogger();

    const summary = await writePublishedRecipes({
      rows: [],
      recipesRoot: root,
      logger,
    });

    expect(summary).toEqual({
      formsSeen: 0,
      filesWritten: 0,
      filesUnchanged: 0,
      conflicts: 0,
    });
    const entries = await fs.readdir(root);
    expect(entries).toEqual([]);
  });

  it("builds a connection string from DB_* env vars", () => {
    const url = buildConnectionString({
      DB_HOST: "localhost",
      DB_PORT: "5432",
      DB_USERNAME: "postgres",
      DB_PASSWORD: "postgres",
      DB_NAME: "modular_forms",
    });
    expect(url).toBe(
      "postgres://postgres:postgres@localhost:5432/modular_forms",
    );
  });

  it("url-encodes credentials containing special characters", () => {
    const url = buildConnectionString({
      DB_HOST: "rds.example.com",
      DB_PORT: "5432",
      DB_USERNAME: "user@org",
      DB_PASSWORD: "p@ss:word/!",
      DB_NAME: "modular_forms",
    });
    expect(url).toBe(
      "postgres://user%40org:p%40ss%3Aword%2F!@rds.example.com:5432/modular_forms",
    );
  });

  it("throws listing every missing DB_* env var", () => {
    expect(() =>
      buildConnectionString({ DB_HOST: "localhost", DB_PORT: "5432" }),
    ).toThrow(/DB_USERNAME.*DB_PASSWORD.*DB_NAME/);
  });

  it("logs a summary at the end of a run", async () => {
    const root = await newRoot();
    const rows = [
      await loadFixture("published-row.json"),
      await loadFixture("published-row-v2.json"),
    ];
    const logger = createSpyLogger();

    await writePublishedRecipes({ rows, recipesRoot: root, logger });

    const summaryLine = logger.logs
      .filter((l) => l.level === "info")
      .map((l) => l.message)
      .find((m) => /summary|written/i.test(m));
    expect(summaryLine).toBeDefined();
    // Flat layout (#1196): two rows of the same form collapse to one file —
    // one form, one written, the second a conflict.
    expect(summaryLine!).toMatch(/1 form\(s\)/);
  });
});
