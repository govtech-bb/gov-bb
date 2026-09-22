import type { PGliteInterface } from "@electric-sql/pglite";
import { validateDocument, type PageDocument } from "@govtech-bb/block-kit";
import { beforeAll, describe, expect, it } from "vitest";
import { createMemoryDb } from "./client";
import { COLLECTIONS } from "./seed-data/collections";
import { DOCUMENTS } from "./seed-data/documents";

let db: PGliteInterface;

beforeAll(async () => {
  db = await createMemoryDb();
});

const load = async (url: string): Promise<PageDocument> => {
  const result = await db.query<PageDocument>(
    `select 1 as version, id, url, slug, schema_name, document_type, title,
            description, is_draft, body, updated_at
       from content_pages where url = $1`,
    [url],
  );
  return result.rows[0];
};

const ctx = () => ({
  collections: COLLECTIONS,
  pageUrls: DOCUMENTS.map((d) => d.url),
});

describe("every seeded document is valid", () => {
  for (const doc of DOCUMENTS) {
    it(`${doc.url} passes all nine rules`, async () => {
      const loaded = await load(doc.url);
      expect(validateDocument(loaded, ctx())).toEqual([]);
    });
  }
});

describe("round trip through JSONB", () => {
  const url = "/money-financial-support/calculate-severance-pay/start";

  it("preserves the body exactly, semantically", () => {
    return load(url).then((loaded) => {
      const seeded = DOCUMENTS.find((d) => d.url === url)!;
      expect(loaded.body).toEqual(seeded.body);
    });
  });

  it("does NOT preserve key order — jsonb normalises it", async () => {
    // A real result, and a correction to the acceptance criterion: "saving
    // with no edits produces a byte-identical body" is not achievable with
    // `jsonb`, which stores a parsed representation and re-emits object
    // keys sorted by length then bytewise. Content is untouched; only key
    // order moves. `json` would preserve the text verbatim but gives up
    // the operators and the GIN index. Deep equality is the right check.
    const loaded = await load(url);
    const seeded = DOCUMENTS.find((d) => d.url === url)!;

    expect(JSON.stringify(loaded.body)).not.toBe(JSON.stringify(seeded.body));
    expect(Object.keys(loaded.body)).toEqual(["refs", "blocks", "version"]);
    expect(Object.keys(seeded.body)).toEqual(["version", "blocks", "refs"]);
  });

  it("IS byte-stable once it has been through jsonb once", async () => {
    // Which is what actually matters for a dirty check: normalisation is
    // idempotent, so an unedited save is a no-op after the first read.
    const before = await load(url);
    await db.query(
      `update content_pages set body = $1::jsonb, updated_at = now() where url = $2`,
      [JSON.stringify(before.body), url],
    );
    const after = await load(url);
    expect(JSON.stringify(after.body)).toBe(JSON.stringify(before.body));
  });

  it("preserves the em dash and the bold mark", async () => {
    const loaded = await load(url);
    const list = loaded.body.blocks.find((b) => b.type === "list");
    expect(list && JSON.stringify(list)).toContain(
      "gross pay (weekly or monthly) \u2014 include overtime or bonuses",
    );

    const paragraph = loaded.body.blocks.find((b) => b.id === "b_sv02");
    expect(paragraph && JSON.stringify(paragraph)).toContain(
      '{"text":"estimate","marks":["strong"]}',
    );
  });

  it("keeps `refs` present even when empty", async () => {
    const loaded = await load(url);
    expect(loaded.body.refs).toEqual({});
    expect("refs" in loaded.body).toBe(true);
  });
});

describe("the seed would not validate without the calculator stub", () => {
  it("rule 8 fails when the start_link target is not a seeded page", async () => {
    const loaded = await load(
      "/money-financial-support/calculate-severance-pay/start",
    );
    const errors = validateDocument(loaded, {
      collections: COLLECTIONS,
      // The three pages the brief names, without the calculator page.
      pageUrls: DOCUMENTS.filter((d) => d.slug !== "form").map((d) => d.url),
    });
    expect(errors).toHaveLength(1);
    expect(errors[0].rule).toBe(8);
    expect(errors[0].blockId).toBe("b_sv08");
  });
});
