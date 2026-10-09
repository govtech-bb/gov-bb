import { unified } from "unified";
import remarkParse from "remark-parse";
import { toMarkdown, type Options } from "mdast-util-to-markdown";
import remarkGfm from "remark-gfm";
import remarkDirective from "remark-directive";
import remarkFrontmatter from "remark-frontmatter";
import type { Root, PhrasingContent } from "mdast";
import type { MarkdownNode, PageConversion, PageEditorDefinition } from "./definition";

declare module "unified" {
  interface Data {
    toMarkdownExtensions?: Options[];
  }
}

const body = unified().use(remarkParse).use(remarkGfm).use(remarkDirective).freeze();

const processor = body().use(remarkFrontmatter, ["yaml"]).freeze();

export function parsePageMarkdown(source: string, frontmatter = true): Root {
  const root = (frontmatter ? processor : body).parse(source);

  const visit = (node: Root | MarkdownNode) => {
    if (!("children" in node)) return;
    node.children.forEach((child, index) => {
      if (
        child.type === "textDirective" &&
        /^\d/.test(child.name) &&
        !child.children.length &&
        !Object.keys(child.attributes ?? {}).length
      ) {
        node.children[index] = { type: "text", value: `:${child.name}`, position: child.position };
      } else visit(child);
    });
  };

  visit(root);

  return root;
}

export function stringifyPageMarkdown(root: Root) {
  return toMarkdown(root, {
    ...processor.data("settings"),
    bullet: "-",
    emphasis: "_",
    fences: true,
    extensions: processor.data("toMarkdownExtensions") || [],
  });
}

export class UnsupportedPageContent extends Error {
  constructor(
    readonly node: MarkdownNode,
    message = `The ${node.type} content needs Markdown source editing`,
  ) {
    super(message);
  }
}

export function pageConversion(definition: PageEditorDefinition): PageConversion {
  return {
    $import(node) {
      const handler = definition.pageHandlers.find((item) => item.accepts(node));

      if (!handler) throw new UnsupportedPageContent(node);

      return handler.$import(node, this);
    },
    $export(node) {
      const handler = definition.pageHandlers.find((item) => item.owns(node));

      if (!handler) throw new Error(`Cannot export page node ${node.getType()}`);

      return handler.$export(node, this);
    },
    render(node, key) {
      const handler = definition.pageHandlers.find((item) => item.accepts(node));

      if (!handler) throw new UnsupportedPageContent(node);

      return handler.render(node, this, key);
    },
  };
}

export function phrasing(nodes: MarkdownNode[]): PhrasingContent[] {
  const inline = new Set([
    "text",
    "strong",
    "emphasis",
    "delete",
    "inlineCode",
    "link",
    "break",
    "html",
  ]);

  if (nodes.some((node) => !inline.has(node.type))) throw new Error("Expected inline page content");

  // SAFETY: Every returned node was checked against the supported mdast phrasing variants.
  return nodes as PhrasingContent[];
}

export function blocks(nodes: MarkdownNode[]): import("mdast").BlockContent[] {
  // SAFETY: RootContent includes all mdast block and phrasing types; module exporters own their shape.
  return nodes as import("mdast").BlockContent[];
}
