import { describe, expect, it } from "vitest";
import fc from "fast-check";
import type { PhrasingContent } from "mdast";
import { parseContentMarkdown } from "./page-markdown.ts";
import {
  parseLegacyPageStartLink,
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
});
