import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ESTATE } from "../src/seed-data";
import {
  HAS_DATABASE,
  createScratchDatabase,
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

  const check = (secret?: string) =>
    runScript(
      "scripts/check-import.ts",
      ["--base-url", server.url, "--forms-api", formsApi],
      { PREVIEW_SECRET: secret ?? "" },
    );

  it("passes on the seeded snapshot and counts every level", async () => {
    rows = [];
    const { code, output } = await check(SECRET);
    expect(code, output).toBe(0);
    // No snapshot page is hidden by an ancestor today, so own levels are the totals.
    for (const level of ["public", "preview", "draft"]) {
      const count = ESTATE.pages.filter((p) => p.visibility === level).length;
      expect(output).toContain(`${level}: ${count} pages, 0 failing`);
    }
  }, 60_000);

  it("fails a public page the environment's service_status disables", async () => {
    const page = ESTATE.pages.find(
      (p) => p.visibility === "public" && !p.parent,
    )!;
    rows = [{ slug: page.form_id ?? page.content_slug, status: "disabled" }];
    const { code, output } = await check(SECRET);
    expect(code, output).toBe(1);
    expect(output).toContain(`FAIL ${page.url} expected preview`);
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
});
