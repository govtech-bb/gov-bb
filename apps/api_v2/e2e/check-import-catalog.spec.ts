import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runScript } from "./support";

const SECRET = "e2e-catalog-secret";

// No database and no seeded server (vitest.e2e.config.ts has no global
// setup), so it runs without Postgres: one stub is both --base-url and
// --forms-api.
describe("check-import stops on an unusable answer", () => {
  let page: { status: number; body: unknown } = { status: 404, body: {} };
  let catalog: { status: number; body: unknown } = { status: 200, body: {} };
  const stub: Server = createServer((request, response) => {
    const path = (request.url ?? "").split("?")[0];
    const { status, body } =
      path === "/service_status"
        ? { status: 200, body: { status: "success", data: [] } }
        : path === "/catalog"
          ? catalog
          : page;
    response
      .writeHead(status, { "content-type": "application/json" })
      .end(JSON.stringify(body));
  });
  let origin: string;

  beforeAll(async () => {
    await new Promise<void>((resolve) => stub.listen(0, "127.0.0.1", resolve));
    origin = `http://127.0.0.1:${(stub.address() as AddressInfo).port}`;
  });
  afterAll(async () => {
    await new Promise((resolve) => stub.close(resolve));
  });

  const check = () =>
    runScript(
      "scripts/check-import.ts",
      ["--base-url", origin, "--forms-api", origin, "--json"],
      { PREVIEW_SECRET: SECRET },
    );

  it.each([
    ["500", { status: 500, body: { error: "x" } }, "catalog: 500 from"],
    [
      "200 with no list",
      { status: 200, body: { pages: {} } },
      "catalog: 200 from",
    ],
  ])(
    "stops when /catalog answers %s",
    async (_name, answer, message) => {
      page = { status: 404, body: { error: "not found" } };
      catalog = answer;
      const { code, output, stdout } = await check();
      expect(code, output).toBe(1);
      expect(output).toContain(`${message} ${origin}`);
      expect(stdout).toBe("");
      expect(output).not.toContain(SECRET);
    },
    60_000,
  );

  it("fails a 200 that is not a page, and still finishes", async () => {
    // Passes bodyProblem on a public page, but has no breadcrumbs.
    page = {
      status: 200,
      body: {
        frontmatter: { title: "t" },
        body_markdown: "",
        visibility: "public",
      },
    };
    catalog = { status: 200, body: { pages: [] } };
    const { code, output } = await check();
    expect(code, output).toBe(1);
    expect(output).toMatch(/^FAIL \/\S+ expected public: .*\(not a page\)/m);
    expect(output).toMatch(/^public: \d+ pages, \d+ failing$/m);
    expect(output).toMatch(/^\d+ failing of \d+ pages in snapshot /m);
    expect(output).not.toContain("TypeError");
    expect(output).not.toContain("    at ");
    expect(output).not.toContain(SECRET);
  }, 60_000);
});
