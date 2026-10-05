import { TextT, TextH, Quotes, Minus } from "@phosphor-icons/react";
import {
  $createParagraphNode,
  $createTextNode,
  $createLineBreakNode,
  $isParagraphNode,
  $isTextNode,
  $isLineBreakNode,
  type LexicalNode,
  type TextFormatType,
} from "lexical";
import {
  $createHeadingNode,
  $createQuoteNode,
  $isHeadingNode,
  $isQuoteNode,
  HeadingNode,
  QuoteNode,
  type HeadingTagType,
} from "@lexical/rich-text";
import { $createLinkNode, $isLinkNode } from "@lexical/link";
import { createElement } from "react";
import { TextModule } from "../../editor/modules/text/module";
import { isSupportedLinkUrl as safePageUrl } from "../../editor/modules/links/url";
import type { MarkdownNode, PageHandler, PageModule } from "../definition";
import { blocks, phrasing, UnsupportedPageContent } from "../markdown";
import { pageInsertAction } from "../insertion";
import { PageRuleNode } from "../nodes";

export { isSupportedLinkUrl as safePageUrl } from "../../editor/modules/links/url";

const formats = { strong: "bold", emphasis: "italic", delete: "strikethrough" } satisfies Partial<
  Record<MarkdownNode["type"], TextFormatType>
>;

function formatDescendants(node: LexicalNode, format: TextFormatType) {
  if ($isTextNode(node)) {
    if (!node.hasFormat(format)) node.toggleFormat(format);
  } else if ("getChildren" in node) {
    // SAFETY: This branch is only used with element nodes returned by the registered inline converters.
    for (const child of (node as import("lexical").ElementNode).getChildren())
      formatDescendants(child, format);
  }
}

const text: PageHandler = {
  accepts: (node) =>
    [
      "text",
      "strong",
      "emphasis",
      "delete",
      "inlineCode",
      "break",
      "link",
      "paragraph",
      "heading",
      "blockquote",
      "thematicBreak",
    ].includes(node.type),
  owns: (node) =>
    $isTextNode(node) ||
    $isLineBreakNode(node) ||
    $isLinkNode(node) ||
    $isParagraphNode(node) ||
    $isHeadingNode(node) ||
    $isQuoteNode(node) ||
    node instanceof PageRuleNode,
  $import(node, context) {
    switch (node.type) {
      case "text":
        return [$createTextNode(node.value)];
      case "inlineCode":
        return [$createTextNode(node.value).toggleFormat("code")];
      case "break":
        return [$createLineBreakNode()];
      case "strong":
      case "emphasis":
      case "delete": {
        const children = node.children.flatMap((child) => context.$import(child));

        for (const child of children) formatDescendants(child, formats[node.type]);

        return children;
      }

      case "link": {
        if (!safePageUrl(node.url))
          throw new UnsupportedPageContent(node, "This link destination needs source editing");

        return [
          $createLinkNode(node.url, { title: node.title }).append(
            ...node.children.flatMap((child) => context.$import(child)),
          ),
        ];
      }

      case "paragraph":
        return [
          $createParagraphNode().append(
            ...node.children.flatMap((child) => context.$import(child)),
          ),
        ];
      case "heading": {
        // SAFETY: mdast heading depth is restricted to 1–6.
        const tag = `h${node.depth}` as HeadingTagType;

        return [
          $createHeadingNode(tag).append(
            ...node.children.flatMap((child) => context.$import(child)),
          ),
        ];
      }

      case "blockquote": {
        const unsupported = node.children.find(
          (child) => !["paragraph", "heading", "list", "blockquote"].includes(child.type),
        );

        if (unsupported)
          throw new UnsupportedPageContent(
            unsupported,
            "This quotation contains blocks that need Markdown source editing",
          );

        return [
          $createQuoteNode().append(...node.children.flatMap((child) => context.$import(child))),
        ];
      }

      case "thematicBreak":
        return [new PageRuleNode()];
      default:
        throw new UnsupportedPageContent(node);
    }
  },
  $export(node, context) {
    if ($isTextNode(node)) {
      let result: MarkdownNode = node.hasFormat("code")
        ? { type: "inlineCode", value: node.getTextContent() }
        : { type: "text", value: node.getTextContent() };

      for (const [type, format] of Object.entries(formats)) {
        if (node.hasFormat(format)) {
          // SAFETY: The keys of formats are exactly the three mdast inline-format node types.
          result = { type: type as "strong" | "emphasis" | "delete", children: phrasing([result]) };
        }
      }

      return [result];
    }

    if ($isLineBreakNode(node)) return [{ type: "html", value: "<br>" }];

    if (node instanceof PageRuleNode) return [{ type: "thematicBreak" }];

    if ($isLinkNode(node))
      return [
        {
          type: "link",
          url: node.getURL(),
          title: node.getTitle(),
          children: phrasing(node.getChildren().flatMap((child) => context.$export(child))),
        },
      ];

    if ($isParagraphNode(node))
      return [
        {
          type: "paragraph",
          children: phrasing(node.getChildren().flatMap((child) => context.$export(child))),
        },
      ];

    if ($isHeadingNode(node)) {
      // SAFETY: HeadingNode tags have been validated against h1–h6 by the page definition.
      const depth = Number(node.getTag().slice(1)) as 1 | 2 | 3 | 4 | 5 | 6;

      return [
        {
          type: "heading",
          depth,
          children: phrasing(node.getChildren().flatMap((child) => context.$export(child))),
        },
      ];
    }

    if ($isQuoteNode(node)) {
      const children = node.getChildren().flatMap((child) => context.$export(child));

      const content = children.every((child) =>
        ["paragraph", "heading", "list", "blockquote"].includes(child.type),
      )
        ? blocks(children)
        : [{ type: "paragraph" as const, children: phrasing(children) }];

      // SAFETY: The quote's supported block exporters return legal blockquote children.
      return [{ type: "blockquote", children: content as import("mdast").BlockContent[] }];
    }

    throw new Error(`Unsupported text node ${node.getType()}`);
  },
  render(node, context, key) {
    if (node.type === "text") return node.value;

    if (node.type === "inlineCode") return <code key={key}>{node.value}</code>;

    if (node.type === "break") return <br key={key} />;

    if (node.type === "thematicBreak") return <hr key={key} />;

    if (node.type === "link")
      return (
        <a
          key={key}
          href={safePageUrl(node.url) ? node.url : undefined}
          title={node.title ?? undefined}
        >
          {node.children.map((child, index) => context.render(child, `${key}/${index}`))}
        </a>
      );

    if (
      node.type === "strong" ||
      node.type === "emphasis" ||
      node.type === "delete" ||
      node.type === "paragraph" ||
      node.type === "heading" ||
      node.type === "blockquote"
    ) {
      const tag =
        node.type === "heading"
          ? `h${node.depth}`
          : {
              strong: "strong",
              emphasis: "em",
              delete: "del",
              paragraph: "p",
              blockquote: "blockquote",
            }[node.type];

      return createElement(
        tag,
        { key },
        node.children.map((child, index) => context.render(child, `${key}/${index}`)),
      );
    }

    throw new UnsupportedPageContent(node);
  },
};

export function PageTextModule(): PageModule {
  const base = TextModule({ initialize: false });

  return {
    ...base,
    nodes: [
      ...(base.nodes ?? []),
      { type: "heading", node: HeadingNode },
      { type: "quote", node: QuoteNode },
      { type: "page-rule", node: PageRuleNode },
    ],
    markdown: [text],
    actions: [
      pageInsertAction("page-paragraph", "Text", $createParagraphNode, {
        group: "Text",
        order: 10,
        icon: <TextT />,
        description: "Write a paragraph of text.",
      }),
      ...(["h1", "h2", "h3", "h4", "h5", "h6"] as const).map((tag) =>
        pageInsertAction(`page-${tag}`, `Heading ${tag.slice(1)}`, () => $createHeadingNode(tag), {
          group: "Text",
          order: 10,
          icon: <TextH />,
          description: `Add a level ${tag.slice(1)} heading.`,
        }),
      ),
      pageInsertAction(
        "page-quote",
        "Quote",
        () => $createQuoteNode().append($createParagraphNode()),
        {
          group: "Text",
          order: 10,
          icon: <Quotes />,
          description: "Set a quotation apart from the text.",
        },
      ),
      pageInsertAction("page-rule", "Separator", () => new PageRuleNode(), {
        group: "Text",
        order: 10,
        icon: <Minus />,
        description: "Separate sections with a horizontal line.",
      }),
    ],
    theme: {
      paragraph: "page-paragraph",
      heading: {
        h1: "page-h1",
        h2: "page-h2",
        h3: "page-h3",
        h4: "page-h4",
        h5: "page-h5",
        h6: "page-h6",
      },
      quote: "page-quote",
      text: {
        bold: "font-bold",
        italic: "italic",
        strikethrough: "line-through",
        code: "page-code",
      },
    },
  };
}
