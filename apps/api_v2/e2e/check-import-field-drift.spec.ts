import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ESTATE } from "../src/seed-data";
import { HAS_DATABASE, databaseQuery, startCheckImportEnv } from "./support";

const SECRET = "e2e-preview-secret";

// Its own file, so its server has its own 1,000-reads-a-minute budget: a
// full run is ~251 reads (see check-import.spec.ts).
describe.skipIf(!HAS_DATABASE)("check-import field drift", () => {
  let env: Awaited<ReturnType<typeof startCheckImportEnv>>;

  beforeAll(async () => {
    env = await startCheckImportEnv(SECRET);
  }, 60_000);

  afterAll(async () => {
    await env?.stop();
  });

  it("exits 1 on one public page's title alone, with no status failure", async () => {
    // A title starting with "z" could not differ at index 0.
    const page = ESTATE.pages.find(
      (p) =>
        p.visibility === "public" &&
        !p.parent &&
        !p.title.startsWith("z") &&
        !ESTATE.pages.some((child) => child.parent === p.url),
    );
    expect(page, "the snapshot has no childless public root").toBeDefined();
    await databaseQuery(
      env.database,
      "update content_pages set title = 'zz edited' where url = $1",
      [page!.url],
    );

    const { code, output } = await env.check(SECRET);
    expect(code, output).toBe(1);
    expect(output).toContain(`0 failing of ${ESTATE.pages.length} pages`);
    // The difference is at index 0: the excerpt is the first 40 characters.
    expect(output).toContain(
      `DIFF ${page!.url} title: snapshot ${JSON.stringify(page!.title.slice(0, 40))} api_v2 "zz edited"`,
    );
    expect(output).toMatch(/^1 differences in \d+ pages compared$/m);
    expect(output).not.toContain(SECRET);
  }, 60_000);
});
