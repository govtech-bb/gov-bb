import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { compileContentMarkdown } from "./compile-markdown.ts";
import {
  renderLegacyMarkdownNodes,
  renderMarkdownNodes,
} from "./markdown-react.tsx";
import { parseContentMarkdown } from "./page-markdown.ts";

function compile(source: string) {
  const result = compileContentMarkdown(source);
  if (!result.ok) throw result.errors[0];
  return result.value.hast.children;
}

describe("legacy Markdown renderer callbacks", () => {
  it("keeps original directive nodes and uses shared rendering for other directives", () => {
    const { root } = parseContentMarkdown(
      ':::details[Original label]\nOriginal body.\n:::\n\n::::actions\n:::action{href="/next"}\nContinue\n:::\n::::',
    );
    const original = structuredClone(root);
    let rendered = 0;
    const html = renderToStaticMarkup(
      renderLegacyMarkdownNodes(
        root.children,
        (node) => {
          if (node.type !== "containerDirective" || node.name !== "details")
            return undefined;
          return () => {
            rendered += 1;
            expect(node.children[0]).toMatchObject({
              data: { directiveLabel: true },
            });
            return <aside>Custom disclosure</aside>;
          };
        },
        { html: "legacy" },
      ),
    );

    expect(html).toContain("<aside>Custom disclosure</aside>");
    expect(html).toContain("govbb-button-group");
    expect(html).toContain('href="/next"');
    expect(html).not.toContain("data-govbbmarkd-renderer");
    expect(rendered).toBe(1);
    expect(root).toEqual(original);
  });

  it("honours a summary-item callback without replacing neighbouring default rows", () => {
    const { root } = parseContentMarkdown(
      "::::summary-list\n:::summary-item[Fee]\nBBD 50\n:::\n:::summary-item[Documents]\nPassport\n:::\n::::",
    );
    let calls = 0;
    const html = renderToStaticMarkup(
      renderLegacyMarkdownNodes(root.children, (node) => {
        if (
          node.type !== "containerDirective" ||
          node.name !== "summary-item" ||
          node.children[0]?.type !== "paragraph" ||
          node.children[0].children[0]?.type !== "text" ||
          node.children[0].children[0].value !== "Fee"
        )
          return undefined;
        return () => {
          calls++;
          return <div data-custom-row="">Replacement</div>;
        };
      }),
    );
    expect(calls).toBe(1);
    expect(html).toContain('data-custom-row=""');
    expect(html).not.toContain("BBD 50");
    expect(html).toContain('class="govbb-summary-list__key">Documents');
    expect(html).toContain("Passport");
    expect(html).not.toContain("data-govbbmarkd-renderer");
  });

  it("supports text callbacks and empty output without replacing sibling defaults", () => {
    const { root } = parseContentMarkdown(
      "Before **custom** and **ordinary** and **hidden** after.",
    );
    const html = renderToStaticMarkup(
      renderLegacyMarkdownNodes(root.children, (node) => {
        if (node.type === "text" && node.value === "custom")
          return () => <em>Replacement</em>;
        if (
          node.type === "strong" &&
          node.children[0]?.type === "text" &&
          node.children[0].value === "hidden"
        )
          return () => null;
        return undefined;
      }),
    );
    expect(html).toBe(
      "<p>Before <strong><em>Replacement</em></strong> and <strong>ordinary</strong> and  after.</p>",
    );
  });
});

describe("renderMarkdownNodes", () => {
  it.each([false, true])(
    "honours table section, row and cell overrides with captioned=%s",
    (captioned) => {
      const table = "| A | B |\n| --- | --- |\n| 1 | 2 |";
      const html = renderToStaticMarkup(
        renderMarkdownNodes(
          compile(captioned ? `:::table[Fees]\n${table}\n:::` : table),
          {
            thead: ({ node: _node, ...props }) => (
              <thead {...props} data-host-head="" />
            ),
            tbody: ({ node: _node, ...props }) => (
              <tbody {...props} data-host-body="" />
            ),
            tr: ({ node: _node, ...props }) => (
              <tr {...props} data-host-row="" />
            ),
            th: ({ node: _node, ...props }) => (
              <th {...props} data-host-cell="" />
            ),
            td: ({ node: _node, ...props }) => (
              <td {...props} data-host-cell="" />
            ),
          },
        ),
      );
      expect(html).toContain('data-host-head=""');
      expect(html).toContain('data-host-body=""');
      expect(html.match(/data-host-row=""/g)).toHaveLength(2);
      expect(html.match(/data-host-cell=""/g)).toHaveLength(4);
    },
  );

  it("honours host summary-item overrides", () => {
    const html = renderToStaticMarkup(
      renderMarkdownNodes(
        compile("::::summary-list\n:::summary-item[Fee]\nBBD 50\n:::\n::::"),
        { "summary-item": () => <div data-custom-row="">Replacement</div> },
      ),
    );
    expect(html).toContain('data-custom-row=""');
    expect(html).toContain("Replacement");
    expect(html).not.toContain("BBD 50");
  });

  it.each([
    "<summary-list>Existing HTML</summary-list>",
    "<summary-list><summary-item>Existing HTML</summary-item></summary-list>",
    "<summary-item>Existing HTML</summary-item>",
  ])(
    "retains raw legacy summary markup without treating it as a compiled directive: %s",
    (source) => {
      const result = compileContentMarkdown(source, { html: "legacy" });
      if (!result.ok) throw result.errors[0];
      expect(
        renderToStaticMarkup(renderMarkdownNodes(result.value.hast.children)),
      ).toContain(source);
    },
  );

  it("keeps host link adapters inside summary values, details and captioned tables", () => {
    const children = compile(
      [
        "::::summary-list",
        ":::summary-item[Guidance]",
        "[Read guidance](/guide)",
        ":::",
        "::::",
        "",
        ":::details[More]",
        "[Help](/help)",
        ":::",
        "",
        ":::table[Charges]",
        "| Item | Details |",
        "| --- | --- |",
        "| Copy | [Fees](/fees) |",
        ":::",
      ].join("\n"),
    );
    const html = renderToStaticMarkup(
      renderMarkdownNodes(children, {
        a: ({ node: _node, ...props }) => <a {...props} data-host-link="" />,
      }),
    );
    expect(html.match(/data-host-link=""/g)).toHaveLength(3);
    expect(html).toContain("govbb-summary-list");
    expect(html).toContain('role="region"');
    expect(html).toContain('scope="col"');
    expect(html).toContain('class="govbb-show-hide__summary">More');
  });

  it("does not resolve forms or invent a destination", () => {
    const html = renderToStaticMarkup(
      renderMarkdownNodes(
        compile(
          [
            "::::actions",
            ':::action{form="passport"}',
            "Apply",
            ":::",
            "",
            ':::action{target="form" variant="secondary"}',
            "Another way",
            ":::",
            "::::",
          ].join("\n"),
        ),
      ),
    );
    expect(html).toContain("govbb-button-group");
    expect(html.match(/aria-disabled="true"/g)).toHaveLength(2);
    expect(html).not.toContain("href=");
  });

  it("escapes untrusted raw HTML while preserving ordinary Markdown and safe links", () => {
    const html = renderToStaticMarkup(
      renderMarkdownNodes(
        compile(
          '<img src=x onerror="alert(1)">\n\n[Bad](javascript:alert(1)) and [Call](tel:+12465363800)',
        ),
      ),
    );
    expect(html).not.toContain("<img");
    expect(html).not.toContain('href="javascript:');
    expect(html).toContain('href="tel:+12465363800"');
    expect(html).toContain("&lt;img");
  });
});
