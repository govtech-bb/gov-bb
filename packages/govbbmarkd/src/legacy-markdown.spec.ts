import { describe, expect, it } from "vitest";
import fc from "fast-check";
import type { PhrasingContent } from "mdast";
import { parseContentMarkdown } from "./page-markdown.ts";
import {
  parseLegacyHighlights,
  parseLegacyPageStartLink,
  serializeLegacyHighlights,
  serializeLegacyPageStartLink,
} from "./legacy-markdown.ts";

describe("legacy Markdown compatibility", () => {
  it("round trips literal start labels without interpreting their Markdown or HTML", () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.constantFrom(
            "A",
            "&",
            "<",
            ">",
            "*",
            ":",
            "\n",
            "\r",
            "\\",
            "_",
            '"',
            "'",
            "😀",
            "é",
            "中",
          ),
          { maxLength: 80 },
        ),
        (characters) => {
          const label = characters.join("");
          const source = serializeLegacyPageStartLink(
            [{ type: "text", value: label }],
            "/apply?a=1&b=2",
          );
          const root = parseContentMarkdown(source).root;
          const node = root.children[0];
          if (!node) throw new Error("Expected the serialized start link");
          const parsed = parseLegacyPageStartLink(node);
          expect(parsed?.href).toBe("/apply?a=1&b=2");
          expect(
            parsed?.label
              .map((child) =>
                child.type === "text" ? child.value : child.type,
              )
              .join(""),
          ).toBe(label);
        },
      ),
      { numRuns: 500 },
    );
  });

  it("round trips nested formatting and sibling text in start labels", () => {
    fc.assert(
      fc.property(
        fc.array(fc.constantFrom("strong", "emphasis", "delete"), {
          maxLength: 8,
        }),
        (formats) => {
          let label: PhrasingContent[] = [{ type: "text", value: "Apply" }];
          for (const type of formats) {
            label = [
              { type: "text", value: "Before " },
              { type, children: label },
              { type: "text", value: " after" },
            ];
          }
          const source = serializeLegacyPageStartLink(label, "/apply");
          expect(
            parseLegacyPageStartLink({ type: "html", value: source }),
          ).toEqual({ label, href: "/apply" });
        },
      ),
    );
  });

  it.each([
    "<a data-start-link></strong>Start</a>",
    "<a data-start-link><strong>Start</em></a>",
    "<a data-start-link><strong>Start</a>",
    "<a data-start-link><code><strong>Start</strong></code></a>",
    '<a data-start-link onclick="run()">Start</a>',
    '<a data-start-link href="javascript&#58;alert(1)">Start</a>',
    '<a data-start-link><strong onmouseover="run()">Start</strong></a>',
  ])("does not import unsupported start HTML: %s", (source) => {
    const node = parseContentMarkdown(source).root.children[0];
    if (!node) throw new Error("Expected HTML source");
    expect(parseLegacyPageStartLink(node)).toBeUndefined();
  });

  it("reads highlights HTML as titles and plain text", () => {
    const node = parseContentMarkdown(
      '<highlights>\n<highlight title="Water &amp; food">Store 3 gallons<br>per person.</highlight>\n<highlight title="Documents">Keep\n  your ID &lt;dry&gt;.</highlight>\n</highlights>',
    ).root.children[0];
    if (!node) throw new Error("Expected HTML source");
    expect(parseLegacyHighlights(node)).toEqual([
      {
        title: "Water & food",
        text: [
          { type: "text", value: "Store 3 gallons" },
          { type: "break" },
          { type: "text", value: "per person." },
        ],
      },
      {
        title: "Documents",
        text: [{ type: "text", value: "Keep your ID <dry>." }],
      },
    ]);
  });

  it("round trips literal highlight titles and text as one HTML block", () => {
    const characters = fc.array(
      fc.constantFrom(
        "A",
        "&",
        ";",
        "#",
        "<",
        ">",
        "*",
        ":",
        "\\",
        "_",
        '"',
        "'",
        " ",
        " ",
        "😀",
        "é",
        "中",
      ),
      { maxLength: 40 },
    );
    fc.assert(
      fc.property(
        fc.array(fc.tuple(characters, characters), {
          minLength: 1,
          maxLength: 4,
        }),
        (items) => {
          const highlights = items.map(([title, text]) => ({
            title: title.join(""),
            text: [{ type: "text" as const, value: text.join("") }],
          }));
          const root = parseContentMarkdown(
            serializeLegacyHighlights(highlights),
          ).root;
          expect(root.children).toHaveLength(1);
          const node = root.children[0];
          if (!node) throw new Error("Expected the serialized highlights");
          expect(parseLegacyHighlights(node)).toEqual(
            highlights.map(({ title, text }) => ({
              title,
              // Spaces collapse, as they do on the page
              text: text
                .map((part) => ({
                  ...part,
                  value: part.value.replace(/ +/g, " "),
                }))
                .filter((part) => part.value),
            })),
          );
        },
      ),
      { numRuns: 500 },
    );
  });

  it("does not write highlight text other than plain text and line breaks", () => {
    expect(() =>
      serializeLegacyHighlights([
        {
          title: "Water",
          text: [{ type: "strong", children: [{ type: "text", value: "3" }] }],
        },
      ]),
    ).toThrow("A highlight can only hold plain text and line breaks");
  });

  it.each([
    "<highlights>\n</highlights>",
    '<highlights>\n<highlight title="Water">Store <strong>3</strong> gallons.</highlight>\n</highlights>',
    '<highlights>\n<highlight title="Water" class="wide">Store water.</highlight>\n</highlights>',
    "<highlights>\n<highlight title='Water'>Store water.</highlight>\n</highlights>",
    "<highlights>\n<highlight>Store water.</highlight>\n</highlights>",
    '<highlights>\nBefore\n<highlight title="Water">Store water.</highlight>\n</highlights>',
    '<highlights class="wide">\n<highlight title="Water">Store water.</highlight>\n</highlights>',
    '<highlight title="Water">Store water.</highlight>',
  ])("does not import unsupported highlights HTML: %s", (source) => {
    const node = parseContentMarkdown(source).root.children[0];
    if (!node) throw new Error("Expected HTML source");
    expect(parseLegacyHighlights(node)).toBeUndefined();
  });
});
