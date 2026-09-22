import { describe, expect, it } from "vitest";
import type { Block } from "@govtech-bb/block-kit";
import {
  ListRegistry,
  fromBlockNote,
  inlineToSpans,
  spansToInline,
  toBlockNote,
} from "./adapter";

/** The severance page's prose, verbatim from the seed — canaries included. */
const SEVERANCE: Block[] = [
  {
    id: "b_sv01",
    type: "paragraph",
    content: [
      {
        text: "You should complete the calculator in one go. At the moment, it is not possible to save your answers and come back to them later.",
      },
    ],
  },
  {
    id: "b_sv02",
    type: "paragraph",
    content: [
      { text: "This tool only gives an " },
      { text: "estimate", marks: ["strong"] },
      {
        text: " based on the Severance Payments Act (Cap. 355A). Your contract of employment may entitle you to more. It is not legal advice.",
      },
    ],
  },
  {
    id: "b_sv03",
    type: "heading",
    level: 2,
    anchor: "how-long-does-it-take",
    content: [{ text: "How long does it take?" }],
  },
  {
    id: "b_sv07",
    type: "list",
    ordered: false,
    items: [
      {
        id: "b_sv07a",
        content: [
          {
            text: "why you were sent home (redundancy, disaster, lay-off or short time, or death of employer)",
          },
        ],
      },
      {
        id: "b_sv07b",
        content: [{ text: "your start date and your last day at work" }],
      },
      {
        id: "b_sv07c",
        content: [
          {
            text: "your usual gross pay (weekly or monthly) — include overtime or bonuses",
          },
        ],
      },
    ],
  },
  {
    id: "b_sv08",
    type: "start_link",
    label: "Start your estimate now",
    target_kind: "page",
    target: "/money-financial-support/calculate-severance-pay/form",
  },
];

const roundTrip = (blocks: Block[]): Block[] => {
  const registry = new ListRegistry();
  let minted = 0;
  return fromBlockNote(
    toBlockNote(blocks, registry),
    registry,
    () => `b_minted_${(minted += 1)}`,
  );
};

describe("the round trip", () => {
  it("returns the severance document unchanged", () => {
    // The assertion ADR 0074 exists for: BlockNote is a view, and a document
    // that was loaded and not edited must serialize back byte for byte.
    expect(roundTrip(SEVERANCE)).toEqual(SEVERANCE);
  });

  it("is stable on a second pass", () => {
    // Catches a normalisation that mangles once and then agrees with itself.
    expect(roundTrip(roundTrip(SEVERANCE))).toEqual(SEVERANCE);
  });

  it("keeps the list container id, which BlockNote has nowhere to store", () => {
    const list = roundTrip(SEVERANCE).find((b) => b.type === "list");
    expect(list?.id).toBe("b_sv07");
    expect(list && "items" in list && list.items.map((i) => i.id)).toEqual([
      "b_sv07a",
      "b_sv07b",
      "b_sv07c",
    ]);
  });

  it("keeps the em dash and the bold run", () => {
    const json = JSON.stringify(roundTrip(SEVERANCE));
    expect(json).toContain(
      "gross pay (weekly or monthly) — include overtime or bonuses",
    );
    expect(roundTrip(SEVERANCE)[1]).toMatchObject({
      content: [
        expect.anything(),
        { text: "estimate", marks: ["strong"] },
        expect.anything(),
      ],
    });
  });

  it("reassigns no ids", () => {
    expect(roundTrip(SEVERANCE).map((b) => b.id)).toEqual(
      SEVERANCE.map((b) => b.id),
    );
  });
});

describe("spans", () => {
  it("omits marks entirely when a span has none", () => {
    // An empty `marks: []` would be a new key the seed does not have, and
    // the byte-identical save would fail on it.
    const [span] = inlineToSpans([{ type: "text", text: "plain", styles: {} }]);
    expect(span).toEqual({ text: "plain" });
    expect("marks" in span).toBe(false);
  });

  it("maps every mark both ways", () => {
    const spans = [{ text: "x", marks: ["strong", "em", "code"] as const }];
    expect(spansToInline(spans as never)).toEqual([
      {
        type: "text",
        text: "x",
        styles: { bold: true, italic: true, code: true },
      },
    ]);
    expect(inlineToSpans(spansToInline(spans as never))).toEqual(spans);
  });

  it("merges adjacent runs BlockNote split at a style boundary", () => {
    // Typing mid-paragraph can leave two identically-styled runs. Left
    // alone they would double the span count on every save.
    expect(
      inlineToSpans([
        { type: "text", text: "one ", styles: {} },
        { type: "text", text: "two", styles: {} },
      ]),
    ).toEqual([{ text: "one two" }]);
  });

  it("does not merge across a style boundary", () => {
    expect(
      inlineToSpans([
        { type: "text", text: "plain ", styles: {} },
        { type: "text", text: "bold", styles: { bold: true } },
      ]),
    ).toEqual([{ text: "plain " }, { text: "bold", marks: ["strong"] }]);
  });

  it("carries a value reference through, though no seeded page uses one", () => {
    const spans = [{ ref: "r1", field: "name" }];
    expect(inlineToSpans(spansToInline(spans))).toEqual(spans);
  });
});

describe("the closed palette", () => {
  it("drops a block type BlockNote can produce but the palette does not offer", () => {
    // A pasted table or code block has no home in the document. Dropping it
    // on the way in is the palette holding from the other side.
    const registry = new ListRegistry();
    const result = fromBlockNote(
      [
        {
          id: "a",
          type: "paragraph",
          content: [{ type: "text", text: "kept", styles: {} }],
        },
        { id: "b", type: "table", props: {} },
        {
          id: "c",
          type: "codeBlock",
          content: [{ type: "text", text: "alert(1)", styles: {} }],
        },
      ],
      registry,
      () => "minted",
    );
    expect(result.map((b) => b.type)).toEqual(["paragraph"]);
  });

  it("round-trips a finder's nested configuration through a flat prop", () => {
    const finder: Block[] = [
      {
        id: "b_ph01",
        type: "finder",
        collection: "pharmacies",
        document_noun: "pharmacy",
        results_per_page: 20,
        empty_message: "No pharmacies match your filters.",
        search: { enabled: true, label: "Search", fields: ["name"] },
        facets: [
          {
            key: "openNow",
            name: "Open now",
            type: "checkbox",
            computed_from: "hours",
          },
        ],
        sort: [{ key: "name", name: "A to Z", default: true }],
        result_template: {
          title: "name",
          metadata: ["parish"],
          detail_url: "/x/{slug}",
        },
      },
    ];
    expect(roundTrip(finder)).toEqual(finder);
  });
});

describe("lists", () => {
  it("splits a list into one BlockNote block per item", () => {
    const registry = new ListRegistry();
    const bn = toBlockNote(SEVERANCE, registry);
    const items = bn.filter((b) => b.type === "bulletListItem");
    expect(items.map((b) => b.id)).toEqual(["b_sv07a", "b_sv07b", "b_sv07c"]);
  });

  it("mints a container id for a list that was never in the document", () => {
    const registry = new ListRegistry();
    const result = fromBlockNote(
      [
        {
          id: "n1",
          type: "bulletListItem",
          content: [{ type: "text", text: "new", styles: {} }],
        },
      ],
      registry,
      () => "b_fresh",
    );
    expect(result).toEqual([
      {
        id: "b_fresh",
        type: "list",
        ordered: false,
        items: [{ id: "n1", content: [{ text: "new" }] }],
      },
    ]);
  });

  it("separates a bulleted run from a numbered one", () => {
    const registry = new ListRegistry();
    let n = 0;
    const result = fromBlockNote(
      [
        {
          id: "a",
          type: "bulletListItem",
          content: [{ type: "text", text: "a", styles: {} }],
        },
        {
          id: "b",
          type: "numberedListItem",
          content: [{ type: "text", text: "b", styles: {} }],
        },
      ],
      registry,
      () => `m${(n += 1)}`,
    );
    expect(result.map((b) => "ordered" in b && b.ordered)).toEqual([
      false,
      true,
    ]);
  });
});
