import type { PGliteInterface } from "@electric-sql/pglite";
import type { Block } from "@govtech-bb/block-kit";
import { beforeEach, describe, expect, it } from "vitest";
import { createMemoryDb } from "./client";
import { ConflictError, PgliteStore, ValidationFailedError } from "./store";
import { COLLECTIONS } from "./seed-data/collections";
import { DOCUMENTS } from "./seed-data/documents";

let db: PGliteInterface;
let store: PgliteStore;

beforeEach(async () => {
  db = await createMemoryDb();
  store = new PgliteStore(db);
});

const severance = async () => {
  const doc = await store.getByUrl(
    "/money-financial-support/calculate-severance-pay/start",
  );
  if (!doc) throw new Error("seed missing");
  return doc;
};

describe("list and get", () => {
  it("lists every seeded page, ordered by url", async () => {
    const summaries = await store.list();
    expect(summaries).toHaveLength(DOCUMENTS.length);
    // Derived from the seed rather than listed, so adding a page is a
    // one-line change here instead of a puzzling failure.
    expect(summaries.map((s) => s.url)).toEqual(
      DOCUMENTS.map((d) => d.url).sort(),
    );
  });

  it("returns null for an id that does not exist", async () => {
    expect(await store.get("00000000-0000-0000-0000-000000000000")).toBeNull();
  });

  it("reads collections and their records", async () => {
    const collections = await store.listCollections();
    expect(collections.map((c) => c.key)).toEqual(
      COLLECTIONS.map((c) => c.key).sort(),
    );
    expect(await store.records("pharmacies")).toHaveLength(163);
  });
});

describe("save", () => {
  it("accepts an unedited document and moves updated_at forward", async () => {
    const doc = await severance();
    const saved = await store.save(doc, doc.updated_at);
    expect(saved.body).toEqual(doc.body);
    expect(saved.updated_at).not.toBe(doc.updated_at);
  });

  it("persists an edit", async () => {
    const doc = await severance();
    const edited = {
      ...doc,
      body: {
        ...doc.body,
        blocks: [
          ...doc.body.blocks,
          {
            id: "b_new",
            type: "paragraph",
            content: [{ text: "Added by a test." }],
          } as Block,
        ],
      },
    };
    await store.save(edited, doc.updated_at);
    const reloaded = await severance();
    expect(reloaded.body.blocks).toHaveLength(doc.body.blocks.length + 1);
  });

  it("writes a change_events row per save", async () => {
    const doc = await severance();
    const first = await store.save(doc, doc.updated_at);
    await store.save(first, first.updated_at);

    const events = await db.query<{ version_no: number }>(
      `select version_no from change_events
        where entity_id = $1 order by version_no`,
      [doc.id],
    );
    expect(events.rows.map((r) => r.version_no)).toEqual([1, 2]);
  });
});

describe("ifUpdatedAt is enforced, not decorative", () => {
  it("throws ConflictError when the stored updated_at has moved on", async () => {
    const doc = await severance();
    // Someone else saves first.
    await store.save(doc, doc.updated_at);
    // We still hold the value we loaded.
    await expect(store.save(doc, doc.updated_at)).rejects.toBeInstanceOf(
      ConflictError,
    );
  });

  it("leaves the row untouched when it conflicts", async () => {
    const doc = await severance();
    const winner = await store.save(
      { ...doc, title: "Saved by the winner" },
      doc.updated_at,
    );
    await expect(
      store.save({ ...doc, title: "Saved by the loser" }, doc.updated_at),
    ).rejects.toBeInstanceOf(ConflictError);

    const reloaded = await severance();
    expect(reloaded.title).toBe("Saved by the winner");
    expect(reloaded.updated_at).toBe(winner.updated_at);
  });

  it("a null ifUpdatedAt force-saves", async () => {
    const doc = await severance();
    await store.save(doc, doc.updated_at);
    await expect(store.save(doc, null)).resolves.toBeDefined();
  });
});

describe("save refuses an invalid document and names the failing block", () => {
  it("rejects a finder naming an unknown collection (rule 5)", async () => {
    const doc = await store.getByUrl(
      "/health-and-emergency-services/find-an-open-pharmacy/find",
    );
    if (!doc) throw new Error("seed missing");
    const broken = structuredClone(doc);
    const finder = broken.body.blocks[0];
    if (finder.type !== "finder") throw new Error("expected a finder");
    finder.collection = "clinics";

    const error = await store
      .save(broken, doc.updated_at)
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ValidationFailedError);
    const failed = error as ValidationFailedError;
    expect(failed.errors[0].rule).toBe(5);
    expect(failed.errors[0].blockId).toBe("b_ph01");
  });

  it("rejects a facet that is not a field and has no computed_from (rule 6)", async () => {
    const doc = await store.getByUrl(
      "/health-and-emergency-services/find-an-open-pharmacy/find",
    );
    if (!doc) throw new Error("seed missing");
    const broken = structuredClone(doc);
    const finder = broken.body.blocks[0];
    if (finder.type !== "finder") throw new Error("expected a finder");
    finder.facets.push({
      key: "wheelchair",
      name: "Step-free",
      type: "checkbox",
    });

    const error = await store
      .save(broken, doc.updated_at)
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ValidationFailedError);
    expect((error as ValidationFailedError).errors[0].rule).toBe(6);
  });

  it("does not write the row when validation fails", async () => {
    const doc = await severance();
    const broken = structuredClone(doc);
    broken.body.blocks.push({
      id: "b_sv01", // duplicate id — rule 3
      type: "paragraph",
      content: [{ text: "dupe" }],
    });
    await expect(store.save(broken, doc.updated_at)).rejects.toBeInstanceOf(
      ValidationFailedError,
    );
    const reloaded = await severance();
    expect(reloaded.updated_at).toBe(doc.updated_at);
  });
});

describe("delete", () => {
  it("removes the row", async () => {
    const doc = await severance();
    await store.delete(doc.id);
    expect(await store.get(doc.id)).toBeNull();
    expect(await store.list()).toHaveLength(DOCUMENTS.length - 1);
  });
});
