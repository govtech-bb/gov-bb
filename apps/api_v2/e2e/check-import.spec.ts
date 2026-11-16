import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ESTATE, ESTATE_SOURCE } from "../src/seed-data";
import {
  HAS_DATABASE,
  createScratchDatabase,
  databaseQuery,
  dropScratchDatabase,
  runScript,
  startServer,
  type Server,
} from "./support";

const SECRET = "e2e-preview-secret";

describe.skipIf(!HAS_DATABASE)("check-import", () => {
  // api v1's GET /service_status, rows set per test.
  let rows: { slug: string; status: string }[] = [];
  const stub = createServer((_request, response) => {
    response
      .writeHead(200, { "content-type": "application/json" })
      .end(JSON.stringify({ status: "success", data: rows }));
  });
  let server: Server;
  let database: string;
  let formsApi: string;

  beforeAll(async () => {
    await new Promise<void>((resolve) => stub.listen(0, "127.0.0.1", resolve));
    formsApi = `http://127.0.0.1:${(stub.address() as AddressInfo).port}`;
    database = await createScratchDatabase();
    server = await startServer({
      DB_NAME: database,
      SEED: "true",
      PREVIEW_SECRET: SECRET,
    });
  }, 60_000);

  afterAll(async () => {
    await server?.stop();
    if (database) await dropScratchDatabase(database);
    await new Promise((resolve) => stub.close(resolve));
  });

  const check = (secret?: string, extra: string[] = []) =>
    runScript(
      "scripts/check-import.ts",
      ["--base-url", server.url, "--forms-api", formsApi, ...extra],
      { PREVIEW_SECRET: secret ?? "" },
    );

  it("passes on the seeded snapshot and counts every level", async () => {
    rows = [];
    const { code, output } = await check(SECRET);
    expect(code, output).toBe(0);
    for (const level of ["public", "preview", "draft"]) {
      expect(output).toMatch(
        new RegExp(`^${level}: \\d+ pages, 0 failing$`, "m"),
      );
    }
    expect(output).toContain(`0 failing of ${ESTATE.pages.length} pages`);
    // The real serving code agrees with the snapshot on every non-draft page.
    expect(output).toMatch(/^0 differences in \d+ pages compared$/m);
  }, 60_000);

  it("fails a disabled public page and, by the ancestor rule, its child", async () => {
    // A public parent and child with different keys, so only the ancestor
    // rule can lower the child.
    const key = (p: (typeof ESTATE.pages)[number]) =>
      p.form_id ?? p.content_slug;
    const byUrl = new Map(ESTATE.pages.map((p) => [p.url, p]));
    const child = ESTATE.pages.find((p) => {
      const parent = p.parent ? byUrl.get(p.parent) : undefined;
      return (
        p.visibility === "public" &&
        parent?.visibility === "public" &&
        !parent.parent &&
        key(parent) !== key(p)
      );
    });
    expect(
      child,
      "the snapshot has no such public parent and child",
    ).toBeDefined();
    const parent = byUrl.get(child!.parent!)!;
    rows = [{ slug: key(parent), status: "disabled" }];
    const { code, output } = await check(SECRET);
    expect(code, output).toBe(1);
    expect(output).toContain(`FAIL ${parent.url} expected preview`);
    expect(output).toContain(`FAIL ${child!.url} expected preview`);
  }, 60_000);

  it("stops on a refused token, or none at all", async () => {
    rows = [];
    const wrong = await check("not-the-secret");
    expect(wrong.code, wrong.output).toBe(1);
    expect(wrong.output).toContain(`preview token refused by ${server.url}`);
    expect(wrong.output).not.toContain("FAIL");
    expect(wrong.output).not.toContain("not-the-secret");

    const none = await check();
    expect(none.code, none.output).toBe(1);
    expect(none.output).toContain("PREVIEW_SECRET");
    expect(none.output).not.toContain("pages,");
  }, 60_000);

  // Last: it changes the shared scratch database, which afterAll drops.
  it("reports drift and exits 1", async () => {
    rows = [];
    const leaf = (visibility: string, not: string[] = []) =>
      ESTATE.pages.find(
        (p) =>
          p.visibility === visibility &&
          !p.parent &&
          !not.includes(p.url) &&
          !ESTATE.pages.some((child) => child.parent === p.url),
      );
    const edited = leaf("preview");
    const removed = leaf("public");
    const redirected = leaf("public", [removed?.url ?? ""]);
    expect(edited, "the snapshot has no childless preview root").toBeDefined();
    expect(removed, "the snapshot has no childless public root").toBeDefined();
    expect(redirected, "the snapshot has no second public root").toBeDefined();

    await databaseQuery(
      database,
      "update content_pages set body_markdown = $1 where url = $2",
      ["edited in the database", edited!.url],
    );
    await databaseQuery(database, "delete from content_pages where url = $1", [
      removed!.url,
    ]);
    // A deleted page whose url now redirects answers 301: a status FAIL, never
    // `missing` (a transient or odd answer must not make #3711 create a page).
    await databaseQuery(database, "delete from content_pages where url = $1", [
      redirected!.url,
    ]);
    await databaseQuery(
      database,
      "insert into page_redirects (source_url, destination_url) values ($1, $2)",
      [redirected!.url, edited!.url],
    );
    await databaseQuery(
      database,
      "insert into content_pages (url, slug, title, body_markdown, visibility) values ('/e2e-extra', 'e2e-extra', 'Extra', 'extra', 'preview')",
    );

    // One --json run covers the rows (stderr) and the JSON (stdout): the site
    // routes allow 1,000 reads a minute and each run makes ~251, so a second
    // full run here would be rate limited.
    // ponytail: the file makes 3 full runs of 2N+1 reads (N snapshot pages)
    // against that per-IP limit, so it fails with "rate limited" from about
    // N = 165 (125 today). Then exempt the e2e server's script reads (a
    // landing token on the server and in the script), or split the file.
    const json = await check(SECRET, ["--json"]);
    expect(json.code, json.output).toBe(1);
    expect(json.output).toContain(`DIFF ${edited!.url} body_markdown:`);
    expect(json.output).toContain(`DIFF ${removed!.url} missing`);
    expect(json.output).toContain("DIFF /e2e-extra extra");
    expect(json.output).toContain(`FAIL ${redirected!.url} expected public`);
    expect(json.output).not.toContain(`DIFF ${redirected!.url}`);
    expect(json.output).not.toContain(SECRET);
    const parsed = JSON.parse(json.stdout);
    expect(parsed.differences).toHaveLength(3);
    expect(parsed).toEqual({
      source: ESTATE_SOURCE,
      differences: expect.arrayContaining([
        {
          kind: "field",
          url: edited!.url,
          field: "body_markdown",
          expected: edited!.body_markdown,
          actual: "edited in the database",
        },
        { kind: "missing", url: removed!.url },
        { kind: "extra", url: "/e2e-extra" },
      ]),
    });
  }, 60_000);
});
