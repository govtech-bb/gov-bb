import { describe, expect, it } from "vitest";
import { collectionsFor } from "./collections-needed";
import type { Block, PageDocument, Ref } from "./types";

const doc = (
  blocks: Block[],
  refs: Record<string, Ref> = {},
): PageDocument => ({
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

const finder = (
  overrides: Partial<Extract<Block, { type: "finder" }>> = {},
): Block => ({
  id: "b-finder",
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
});

const calendar: Block = {
  id: "b-calendar",
  type: "calendar",
  collection: "bank_holiday_rules",
  year_range: { min: 2026, max: 2027 },
  substitution_rule: "cap-352",
  show_past: false,
  columns: [{ field: "name", label: "Holiday" }],
};

const contact: Block = {
  id: "b-contact",
  type: "contact",
  title: "Get help",
  description: [{ text: "Call the Drug Service." }],
  collection: "organisations",
  record: "drug-service",
  fields: [{ field: "phone", label: "Telephone" }],
};

const paragraph: Block = {
  id: "b-paragraph",
  type: "paragraph",
  content: [{ text: "Nothing here reads a collection." }],
};

describe("which collections a page reads", () => {
  it("reads a finder's collection", () => {
    expect(collectionsFor(doc([finder()]))).toEqual(["pharmacies"]);
  });

  it("reads the collection a finder facet draws its options from", () => {
    const block = finder({
      facets: [
        {
          key: "parish",
          name: "Parish",
          type: "checkbox",
          allowed_values_from: "parishes",
        },
        // A facet listing its own values reads nothing extra.
        {
          key: "type",
          name: "Type",
          type: "radio",
          allowed_values: [{ value: "retail", label: "Retail" }],
        },
      ],
    });
    expect(collectionsFor(doc([block]))).toEqual(["parishes", "pharmacies"]);
  });

  it("reads a calendar's collection", () => {
    expect(collectionsFor(doc([calendar]))).toEqual(["bank_holiday_rules"]);
  });

  it("reads a contact block's collection, which it names directly", () => {
    expect(collectionsFor(doc([contact]))).toEqual(["organisations"]);
  });

  it("reads the collections behind record and query refs, not page or external ones", () => {
    const refs: Record<string, Ref> = {
      r_rates: {
        kind: "record",
        collection: "severance_rates",
        record: "2026",
      },
      q_offices: { kind: "query", collection: "nis_offices", limit: 5 },
      p_form: { kind: "page", url: "/money-financial-support/form" },
      e_act: { kind: "external", href: "https://oag.gov.bb/act.pdf" },
    };
    expect(collectionsFor(doc([paragraph], refs))).toEqual([
      "nis_offices",
      "severance_rates",
    ]);
  });

  it("names each collection once, in sorted order", () => {
    const refs: Record<string, Ref> = {
      r_drug_service: {
        kind: "record",
        collection: "organisations",
        record: "drug-service",
      },
      q_pharmacies: { kind: "query", collection: "pharmacies" },
    };
    expect(
      collectionsFor(doc([contact, finder(), calendar, finder()], refs)),
    ).toEqual(["bank_holiday_rules", "organisations", "pharmacies"]);
  });

  it("reads nothing for a prose-only page", () => {
    expect(collectionsFor(doc([paragraph]))).toEqual([]);
  });

  it("reads nothing when there is no document", () => {
    expect(collectionsFor(null)).toEqual([]);
    expect(collectionsFor(undefined)).toEqual([]);
  });
});
