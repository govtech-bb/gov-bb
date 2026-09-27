import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import matter from "gray-matter";
import { describe, expect, it } from "vitest";
import { openDb } from "../db.js";
import { buildPages } from "./pages.js";
import { seed } from "./index.js";

const SEED_DIR = fileURLToPath(new URL("../../seed", import.meta.url));
const FIXTURES_DIR = fileURLToPath(new URL("./__fixtures__", import.meta.url));

type TreeNode = { position?: unknown; children?: TreeNode[] };

function hasPosition(node: TreeNode): boolean {
  if ("position" in node) return true;
  return (node.children ?? []).some(hasPosition);
}

function loadFixture(path: string): {
  path: string;
  raw: Record<string, unknown>;
  body: string;
} {
  const { data, content } = matter(
    readFileSync(`${FIXTURES_DIR}/${path}`, "utf8"),
  );
  return { path, raw: data, body: content };
}

describe("seed", () => {
  it("validates, derives and inserts the four seed pages and two forms", async () => {
    const db = openDb(":memory:");

    const result = await seed(db, SEED_DIR);

    expect(result).toEqual({ pages: 4, forms: 2 });

    const pages = db
      .prepare(
        "SELECT slug, url, visibility, frontmatter, hast FROM pages ORDER BY url",
      )
      .all() as {
      slug: string;
      url: string;
      visibility: string;
      frontmatter: string;
      hast: string;
    }[];
    expect(pages.map((p) => p.url)).toEqual([
      "family-birth-relationships/get-birth-certificate",
      "family-birth-relationships/get-birth-certificate/start",
      "family-birth-relationships/get-death-certificate",
      "family-birth-relationships/get-death-certificate/start",
    ]);

    for (const page of pages) {
      const hast = JSON.parse(page.hast) as TreeNode;
      expect(hasPosition(hast)).toBe(false);

      const frontmatter = JSON.parse(page.frontmatter) as {
        publish_date?: unknown;
      };
      if (frontmatter.publish_date !== undefined) {
        expect(typeof frontmatter.publish_date).toBe("string");
        expect(
          Number.isNaN(Date.parse(frontmatter.publish_date as string)),
        ).toBe(false);
      }
    }

    const forms = db
      .prepare("SELECT form_id, visibility FROM forms ORDER BY form_id")
      .all() as { form_id: string; visibility: string }[];
    expect(forms).toEqual([
      { form_id: "get-birth-certificate", visibility: "public" },
      { form_id: "get-death-certificate", visibility: "preview" },
    ]);
  });

  it("re-running the seed leaves the counts unchanged", async () => {
    const db = openDb(":memory:");

    await seed(db, SEED_DIR);
    const second = await seed(db, SEED_DIR);

    expect(second).toEqual({ pages: 4, forms: 2 });
    const pageCount = db.prepare("SELECT COUNT(*) AS c FROM pages").get() as {
      c: number;
    };
    const formCount = db.prepare("SELECT COUNT(*) AS c FROM forms").get() as {
      c: number;
    };
    expect(pageCount.c).toBe(4);
    expect(formCount.c).toBe(2);
  });

  it("rejects a bad-visibility page naming its slug and field", () => {
    expect(() => buildPages([loadFixture("bad-visibility/index.md")])).toThrow(
      /bad-visibility.*visibility/s,
    );
  });

  it("rejects an unknown-category page naming its slug and field", () => {
    expect(() =>
      buildPages([loadFixture("unknown-category/index.md")]),
    ).toThrow(/unknown-category.*category/s);
  });

  it("rolls back a bad seed, leaving previous good rows in place", async () => {
    const db = openDb(":memory:");
    await seed(db, SEED_DIR);

    await expect(seed(db, FIXTURES_DIR)).rejects.toThrow();

    const pageCount = db.prepare("SELECT COUNT(*) AS c FROM pages").get() as {
      c: number;
    };
    const formCount = db.prepare("SELECT COUNT(*) AS c FROM forms").get() as {
      c: number;
    };
    expect(pageCount.c).toBe(4);
    expect(formCount.c).toBe(2);
  });
});
