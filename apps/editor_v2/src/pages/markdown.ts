import { parseContentMarkdown, stringifyContentMarkdown } from "@govtech-bb/govbbmarkd";
import type { Root, PhrasingContent } from "mdast";
import { createElement, Fragment, type ReactNode } from "react";
import { renderLegacyMarkdownNodes } from "@govtech-bb/govbbmarkd/react";
import type { MarkdownNode, PageConversion, PageEditorDefinition } from "./definition";

/** The metadata reader needs the tree; the draft codec handles content diagnostics. */
export function parsePageMarkdown(source: string): Root {
  return parseContentMarkdown(source).root;
}

export { stringifyContentMarkdown as stringifyPageMarkdown };

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
      if (!definition.pageHandlers.some((handler) => handler.accepts(node)))
        throw new UnsupportedPageContent(node);

      return createElement(
        Fragment,
        { key },
        renderLegacyPagePreview([node], definition, this, key),
      );
    },
  };
}

/** @deprecated Preserves custom page-module rendering; default previews use the compiled GovBB renderer. */
export function renderLegacyPagePreview(
  nodes: MarkdownNode[],
  definition: PageEditorDefinition,
  context = pageConversion(definition),
  prefix?: string,
): ReactNode {
  return renderLegacyMarkdownNodes(
    nodes,
    (node, key) => {
      const handler = definition.pageHandlers.find((item) => item.accepts(node));
      const render = handler?.render;

      if (!render) return undefined;

      const renderKey =
        prefix === undefined ? key : node === nodes[0] ? prefix : `${prefix}-${key}`;

      return () => render(node, context, renderKey);
    },
    { html: "legacy" },
  );
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
