import { describe, expect, it } from "vitest";
import type { Block, CollectionDefinition, PageDocument, Ref } from "./types";
import { validateDocument, type ValidationContext } from "./validate";

const pharmacies: CollectionDefinition = {
  key: "pharmacies",
  title: "Pharmacies",
  record_key: "slug",
  schema: {
    fields: [
      { key: "slug", label: "Slug", type: "slug" },
      { key: "name", label: "Name", type: "text" },
      { key: "type", label: "Type", type: "select" },
      { key: "pppStatus", label: "Drug Service status", type: "select" },
      { key: "parish", label: "Parish", type: "select" },
      { key: "address", label: "Address", type: "text" },
      { key: "hours", label: "Opening hours", type: "weekly_hours" },
    ],
  },
};

const ctx: ValidationContext = {
  collections: [pharmacies],
  pageUrls: ["/money-financial-support/calculate-severance-pay/form"],
};

const doc = (blocks: Block[], refs = {}): PageDocument => ({
  version: 1,
  id: "doc-1",
  url: "/test",
  slug: "test",
  schema_name: "guide",
  document_type: "test",
  title: "Test",
  description: null,
  is_draft: false,
  body: { version: 1, blocks, refs },
  updated_at: "2026-09-22T00:00:00.000Z",
});

const finder = (overrides: Partial<Extract<Block, { type: "finder" }>> = {}) =>
  ({
    id: "b1",
    type: "finder",
    collection: "pharmacies",
    document_noun: "pharmacy",
    results_per_page: 20,
    empty_message: "Nothing found.",
    search: { enabled: true, label: "Search", fields: ["name"] },
    facets: [],
    sort: [],
    result_template: { title: "name", metadata: [], detail_url: "/x/{slug}" },
    ...overrides,
  }) as Block;

const rulesFailed = (errors: { rule: number }[]) =>
  [...new Set(errors.map((e) => e.rule))].sort((a, b) => a - b);

describe("rule 1 — the body validates against the Zod schema", () => {
  it("rejects a block type outside the closed palette", () => {
    const bad = doc([{ id: "b1", type: "html" } as unknown as Block]);
    expect(rulesFailed(validateDocument(bad, ctx))).toContain(1);
  });

  it("accepts a well-formed prose document", () => {
    const ok = doc([
      { id: "b1", type: "paragraph", content: [{ text: "Hello." }] },
    ]);
    expect(validateDocument(ok, ctx)).toEqual([]);
  });
});

describe("rule 2 — url starts with a slash", () => {
  it("rejects a relative url", () => {
    const bad = { ...doc([]), url: "no-slash" };
    expect(rulesFailed(validateDocument(bad, ctx))).toEqual([2]);
  });
});

describe("rule 3 — block ids are unique within the document", () => {
  it("rejects two blocks sharing an id", () => {
    const bad = doc([
      { id: "dupe", type: "paragraph", content: [{ text: "a" }] },
      { id: "dupe", type: "paragraph", content: [{ text: "b" }] },
    ]);
    expect(rulesFailed(validateDocument(bad, ctx))).toEqual([3]);
  });

  it("treats list item ids as part of the same namespace", () => {
    const bad = doc([
      { id: "shared", type: "paragraph", content: [{ text: "a" }] },
      {
        id: "list",
        type: "list",
        ordered: false,
        items: [{ id: "shared", content: [{ text: "b" }] }],
      },
    ]);
    expect(rulesFailed(validateDocument(bad, ctx))).toEqual([3]);
  });
});

describe("rule 4 — every ref used is defined", () => {
  it("rejects a span pointing at a missing ref", () => {
    const bad = doc([
      {
        id: "b1",
        type: "paragraph",
        content: [{ ref: "ghost", field: "name" }],
      },
    ]);
    expect(rulesFailed(validateDocument(bad, ctx))).toEqual([4]);
  });

  it("accepts a span whose ref is defined", () => {
    const ok = doc(
      [
        {
          id: "b1",
          type: "paragraph",
          content: [{ ref: "wsp", field: "name" }],
        },
      ],
      { wsp: { kind: "record", collection: "pharmacies", record: "w-s-p" } },
    );
    expect(validateDocument(ok, ctx)).toEqual([]);
  });
});

describe("rule 5 — a finder names a collection that exists", () => {
  it("rejects an unknown collection and names the failing block", () => {
    const bad = doc([finder({ collection: "clinics" })]);
    const errors = validateDocument(bad, ctx);
    expect(rulesFailed(errors)).toContain(5);
    expect(errors[0].blockId).toBe("b1");
    expect(errors[0].message).toContain("clinics");
  });
});

describe("rule 6 — a facet key is a field, or is computed from one", () => {
  it("rejects a facet that is neither", () => {
    const bad = doc([
      finder({
        facets: [{ key: "wheelchair", name: "Access", type: "checkbox" }],
      }),
    ]);
    expect(rulesFailed(validateDocument(bad, ctx))).toEqual([6]);
  });

  it("accepts a facet whose key IS a field", () => {
    const ok = doc([
      finder({ facets: [{ key: "parish", name: "Parish", type: "checkbox" }] }),
    ]);
    expect(validateDocument(ok, ctx)).toEqual([]);
  });

  it("accepts a computed facet naming a real source field", () => {
    const ok = doc([
      finder({
        facets: [
          {
            key: "openNow",
            name: "Open now",
            type: "checkbox",
            computed_from: "hours",
          },
        ],
      }),
    ]);
    expect(validateDocument(ok, ctx)).toEqual([]);
  });

  it("accepts a computed facet naming SEVERAL source fields", () => {
    // The pharmacy finder's `slip` facet is a predicate over two fields.
    const ok = doc([
      finder({
        facets: [
          {
            key: "slip",
            name: "Prescription colour",
            type: "radio",
            computed_from: ["type", "pppStatus"],
          },
        ],
      }),
    ]);
    expect(validateDocument(ok, ctx)).toEqual([]);
  });

  it("rejects a computed facet naming a field that does not exist", () => {
    const bad = doc([
      finder({
        facets: [
          {
            key: "openNow",
            name: "Open now",
            type: "checkbox",
            computed_from: "opening",
          },
        ],
      }),
    ]);
    expect(rulesFailed(validateDocument(bad, ctx))).toEqual([6]);
  });
});

describe("rule 7 — result metadata and columns are fields", () => {
  it("rejects metadata naming neither a field nor a facet", () => {
    const bad = doc([
      finder({
        result_template: {
          title: "name",
          metadata: ["rating"],
          detail_url: "/x",
        },
      }),
    ]);
    expect(rulesFailed(validateDocument(bad, ctx))).toEqual([7]);
  });

  it("allows metadata naming a computed facet on the same block", () => {
    const ok = doc([
      finder({
        facets: [
          {
            key: "openNow",
            name: "Open now",
            type: "checkbox",
            computed_from: "hours",
          },
        ],
        result_template: {
          title: "name",
          metadata: ["parish", "openNow"],
          detail_url: "/x",
        },
      }),
    ]);
    expect(validateDocument(ok, ctx)).toEqual([]);
  });

  it("rejects a data_table column that is not a field", () => {
    const bad = doc(
      [
        {
          id: "b1",
          type: "data_table",
          source: "q",
          columns: [{ field: "rating", label: "Rating" }],
          empty_message: "None.",
        },
      ],
      { q: { kind: "query", collection: "pharmacies" } },
    );
    expect(rulesFailed(validateDocument(bad, ctx))).toEqual([7]);
  });
});

describe("rule 8 — an internal start_link points at a real page", () => {
  it("rejects a target that is not a known url", () => {
    const bad = doc([
      {
        id: "b1",
        type: "start_link",
        label: "Start",
        target_kind: "page",
        target: "/nope",
      },
    ]);
    expect(rulesFailed(validateDocument(bad, ctx))).toEqual([8]);
  });

  it("accepts a target that is", () => {
    const ok = doc([
      {
        id: "b1",
        type: "start_link",
        label: "Start",
        target_kind: "page",
        target: "/money-financial-support/calculate-severance-pay/form",
      },
    ]);
    expect(validateDocument(ok, ctx)).toEqual([]);
  });

  it("does not check external or form targets against content_pages", () => {
    const ok = doc([
      {
        id: "b1",
        type: "start_link",
        label: "Start",
        target_kind: "form",
        target: "some-form-id",
      },
    ]);
    expect(validateDocument(ok, ctx)).toEqual([]);
  });
});

describe("rule 9 — heading anchors are unique", () => {
  it("rejects two headings sharing an anchor", () => {
    const bad = doc([
      {
        id: "b1",
        type: "heading",
        level: 2,
        anchor: "how",
        content: [{ text: "How" }],
      },
      {
        id: "b2",
        type: "heading",
        level: 3,
        anchor: "how",
        content: [{ text: "How again" }],
      },
    ]);
    expect(rulesFailed(validateDocument(bad, ctx))).toEqual([9]);
  });
});

describe("the contact block", () => {
  const ministries = {
    key: "ministries",
    title: "Ministries and agencies",
    record_key: "key",
    schema: {
      fields: [
        { key: "key", label: "Key", type: "slug" as const },
        { key: "phone", label: "Telephone", type: "text" as const },
      ],
    },
  };

  const docWith = (block: Block, refs: Record<string, Ref>) =>
    ({
      version: 1,
      id: "d1",
      url: "/x",
      slug: "x",
      schema_name: "guide",
      document_type: "page",
      title: "X",
      description: null,
      is_draft: false,
      body: { version: 1, blocks: [block], refs },
    }) as PageDocument;

  const contact = (overrides: Record<string, unknown> = {}) =>
    ({
      id: "b1",
      type: "contact",
      title: "Get help",
      description: [{ text: "Call them." }],
      source: "r_m",
      fields: [{ field: "phone", label: "Telephone" }],
      ...overrides,
    }) as Block;

  const recordRef: Ref = {
    kind: "record",
    collection: "ministries",
    record: "drug-service",
  };

  it("accepts a record ref and fields the collection has", () => {
    const errors = validateDocument(docWith(contact(), { r_m: recordRef }), {
      collections: [ministries],
      pageUrls: ["/x"],
    });
    expect(errors).toEqual([]);
  });

  it("refuses a field the collection does not have", () => {
    const errors = validateDocument(
      docWith(contact({ fields: [{ field: "fax", label: "Fax" }] }), {
        r_m: recordRef,
      }),
      { collections: [ministries], pageUrls: ["/x"] },
    );
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({ blockId: "b1", rule: 7 });
    expect(errors[0].message).toContain("fax");
  });

  it("refuses a query ref, because a contact shows one organisation", () => {
    const errors = validateDocument(
      docWith(contact(), {
        r_m: { kind: "query", collection: "ministries" },
      }),
      { collections: [ministries], pageUrls: ["/x"] },
    );
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toContain("must be a record ref");
  });

  it("refuses a ref naming a collection that does not exist", () => {
    const errors = validateDocument(
      docWith(contact(), {
        r_m: { kind: "record", collection: "nope", record: "x" },
      }),
      { collections: [ministries], pageUrls: ["/x"] },
    );
    expect(errors[0]).toMatchObject({ rule: 5 });
  });

  it("catches an undefined source ref under rule 4", () => {
    const errors = validateDocument(docWith(contact(), {}), {
      collections: [ministries],
      pageUrls: ["/x"],
    });
    expect(errors[0]).toMatchObject({ rule: 4 });
  });

  it("applies the href allowlist to links in the description", () => {
    // The description is prose, so a link inside it must not escape rule 1.
    const errors = validateDocument(
      docWith(contact({ description: [{ text: "Here", ref: "r_bad" }] }), {
        r_m: recordRef,
        r_bad: { kind: "external", href: "javascript:x" },
      }),
      { collections: [ministries], pageUrls: ["/x"] },
    );
    expect(errors.some((e) => e.message.includes("unsafe href"))).toBe(true);
  });
});
