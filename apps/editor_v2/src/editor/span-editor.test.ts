import { describe, expect, it } from "vitest";
import type { Span } from "@govtech-bb/block-kit";
import { htmlToSpans, spansToHtml } from "./span-editor";

/**
 * The prose round trip. `Span[]` is canonical and the contentEditable is a
 * view of it, so every edit goes Span[] -> HTML -> DOM -> Span[]. If that
 * loop is not lossless, typing in the editor quietly rewrites the document.
 */
const roundTrip = (spans: Span[]): Span[] => {
  const host = document.createElement("div");
  host.innerHTML = spansToHtml(spans);
  return htmlToSpans(host);
};

describe("Span[] survives the contentEditable round trip", () => {
  it("keeps plain text", () => {
    expect(roundTrip([{ text: "About 3 minutes." }])).toEqual([
      { text: "About 3 minutes." },
    ]);
  });

  it("keeps a bold run between two plain runs", () => {
    const spans: Span[] = [
      { text: "This tool only gives an " },
      { text: "estimate", marks: ["strong"] },
      { text: " based on the Act." },
    ];
    expect(roundTrip(spans)).toEqual(spans);
  });

  it("keeps the em dash", () => {
    const spans: Span[] = [
      { text: "your usual gross pay (weekly or monthly) — include overtime" },
    ];
    expect(roundTrip(spans)).toEqual(spans);
  });

  it("keeps em and code marks", () => {
    const spans: Span[] = [
      { text: "emphasis", marks: ["em"] },
      { text: " and " },
      { text: "code", marks: ["code"] },
    ];
    expect(roundTrip(spans)).toEqual(spans);
  });

  it("does not let angle brackets in text become markup", () => {
    const spans: Span[] = [{ text: "<script>alert(1)</script>" }];
    expect(roundTrip(spans)).toEqual(spans);
  });

  it("preserves ampersands", () => {
    expect(roundTrip([{ text: "Marks & Spencer" }])).toEqual([
      { text: "Marks & Spencer" },
    ]);
  });
});

describe("reading the DOM back", () => {
  const parse = (html: string): Span[] => {
    const host = document.createElement("div");
    host.innerHTML = html;
    return htmlToSpans(host);
  };

  it("merges adjacent runs carrying the same marks", () => {
    // execCommand fragments text nodes as you type; without merging, a
    // paragraph grows a new span per keystroke.
    expect(parse("<strong>abc</strong><strong>def</strong>")).toEqual([
      { text: "abcdef", marks: ["strong"] },
    ]);
  });

  it("normalises the tags browsers actually emit", () => {
    // document.execCommand('bold') produces <b> in some browsers, <strong>
    // in others; the document must not record which browser was used.
    expect(parse("<b>bold</b>")).toEqual([{ text: "bold", marks: ["strong"] }]);
    expect(parse("<i>italic</i>")).toEqual([{ text: "italic", marks: ["em"] }]);
  });

  it("collects marks from nested elements", () => {
    expect(parse("<strong><em>both</em></strong>")).toEqual([
      { text: "both", marks: ["strong", "em"] },
    ]);
  });

  it("ignores <br> rather than emitting an empty span", () => {
    expect(parse("one<br>two")).toEqual([{ text: "onetwo" }]);
  });

  it("never returns an empty array, so a block always has a span to edit", () => {
    expect(parse("")).toEqual([{ text: "" }]);
  });
});
