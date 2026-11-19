import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { isValidElement } from "react";
import type { MarkdownNode, PageConversion } from "../../src/pages/definition";
import { PagePreview } from "../../src/pages/preview";
import { pageConversion, UnsupportedPageContent } from "../../src/pages/markdown";
import { govbbPageEditor } from "../../src/presets/govbb-page";

const strong: MarkdownNode = { type: "strong", children: [] };

const textHandler = govbbPageEditor.pageHandlers.find((handler) => handler.accepts(strong));

if (!textHandler) throw new Error("The page preset must support strong text");

const customHandler = {
  ...textHandler,
  accepts: (node: MarkdownNode) => node.type === "strong",
  owns: () => false,
  render(node: MarkdownNode, context: PageConversion, key: string) {
    if (node.type !== "strong") throw new Error("Expected strong text");

    return (
      <mark key={key} data-custom-preview="">
        {node.children.map((child, index) => context.render(child, `${key}-${index}`))}
      </mark>
    );
  },
};

const definition = {
  ...govbbPageEditor,
  pageHandlers: [customHandler, ...govbbPageEditor.pageHandlers],
};

describe("custom page preview handlers", () => {
  it("preserves the recursive conversion context and rejects unsupported direct rendering", () => {
    const seen: PageConversion[] = [];

    const localDefinition = {
      ...definition,
      pageHandlers: [
        {
          ...customHandler,
          render(node: MarkdownNode, context: PageConversion, key: string) {
            seen.push(context);

            return customHandler.render(node, context, key);
          },
        },
        ...govbbPageEditor.pageHandlers,
      ],
    };

    const context = pageConversion(localDefinition);

    const rendered = context.render(
      {
        type: "strong",
        children: [{ type: "strong", children: [{ type: "text", value: "Nested" }] }],
      },
      "custom-root",
    );

    expect(isValidElement(rendered) && rendered.key).toBe("custom-root");
    renderToStaticMarkup(rendered);
    expect(seen).toEqual([context, context]);
    expect(() =>
      context.render({ type: "image", url: "/image.jpg", alt: "Unsupported" }, "image"),
    ).toThrow(UnsupportedPageContent);
  });

  it("keeps the module renderer and recursive context inside shared components", () => {
    const source = [
      "Before **very _important_** after.",
      "- **List item**",
      ":::details[More]\n**Disclosure**\n:::",
      "::::summary-list\n:::summary-item[Guidance]\n**Summary value**\n:::\n::::",
      ':::action{href="/apply"}\n**Apply**\n:::',
      ":::table[Fees]\n| Item | Cost |\n| --- | --- |\n| Copy | **50** |\n:::",
    ].join("\n\n");

    const html = renderToStaticMarkup(<PagePreview source={source} definition={definition} />);

    expect(html).not.toContain("Preview is unavailable");
    expect(html.match(/data-custom-preview=""/g)).toHaveLength(6);
    expect(html).toContain(
      'Before <mark data-custom-preview="">very <em>important</em></mark> after.',
    );
    expect(html).toContain("govbb-show-hide");
    expect(html).toContain("govbb-summary-list");
    expect(html).toContain("govbb-button");
    expect(html).toContain(">Fees</caption>");
  });
});
