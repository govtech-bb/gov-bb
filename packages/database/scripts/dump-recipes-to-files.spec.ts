import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import {
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
    published_at: string | null;
    created_at: string;
    updated_at: string;
  };
  return {
    id: parsed.id,
    form_id: parsed.form_id,
    version: parsed.version,
    schema: parsed.schema,
    published_at: parsed.published_at ? new Date(parsed.published_at) : null,
    created_at: new Date(parsed.created_at),
    updated_at: new Date(parsed.updated_at),
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

  it("writes a single published row to recipes/{formId}/{version}.json", async () => {
    const root = await newRoot();
    const row = await loadFixture("published-row.json");
    const logger = createSpyLogger();

    const summary = await writePublishedRecipes({
      rows: [row],
      recipesRoot: root,
      logger,
    });

    const expectedPath = path.join(root, "passport-renewal", "1.0.0.json");
    const written = await fs.readFile(expectedPath, "utf8");

    expect(written).toBe(JSON.stringify(row.schema, null, 2) + "\n");
    expect(summary).toEqual({
      formsSeen: 1,
      filesWritten: 1,
      filesUnchanged: 0,
      conflicts: 0,
    });
  });

  it("writes multiple versions of the same form to separate files", async () => {
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

    const v1 = await fs.readFile(
      path.join(root, "passport-renewal", "1.0.0.json"),
      "utf8",
    );
    const v2 = await fs.readFile(
      path.join(root, "passport-renewal", "1.1.0.json"),
      "utf8",
    );

    expect(JSON.parse(v1).version).toBe("1.0.0");
    expect(JSON.parse(v2).version).toBe("1.1.0");
    expect(summary.filesWritten).toBe(2);
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
      path.join(root, "passport-renewal", "1.0.0.json"),
      "utf8",
    );

    const summary2 = await writePublishedRecipes({
      rows: [row],
      recipesRoot: root,
      logger: logger2,
    });
    const secondContent = await fs.readFile(
      path.join(root, "passport-renewal", "1.0.0.json"),
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
    const formDir = path.join(root, "passport-renewal");
    await fs.mkdir(formDir, { recursive: true });
    const targetPath = path.join(formDir, "1.0.0.json");
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
    expect(warnings[0].message).toMatch(/passport-renewal.*1\.0\.0\.json/);
    expect(warnings[0].message.toLowerCase()).toMatch(/diff|differs|conflict/);
  });

  it("creates parent directories for new formIds", async () => {
    const root = await newRoot();
    const row = await loadFixture("published-row.json");
    const logger = createSpyLogger();

    await writePublishedRecipes({ rows: [row], recipesRoot: root, logger });

    const stat = await fs.stat(path.join(root, "passport-renewal"));
    expect(stat.isDirectory()).toBe(true);
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
    expect(summaryLine!).toMatch(/2/); // mentions count
  });
});
