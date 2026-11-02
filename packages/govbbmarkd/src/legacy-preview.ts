import type { Element, Root } from "hast";
import type { RootContent } from "mdast";
import type { ReactNode } from "react";
import {
  defaultHandlers,
  type Handler,
  type Handlers,
} from "mdast-util-to-hast";
import {
  compileMarkdownTree,
  type MarkdownCompileOptions,
} from "#govbbmarkd/compile-markdown";
import { isPageDirective } from "#govbbmarkd/page-markdown";

/** @deprecated Resolve HAST component overrides through renderMarkdownNodes instead of MDAST callbacks. */
export type LegacyMarkdownRenderer = (
  node: RootContent,
  key: string,
) => (() => ReactNode) | undefined;

/** @deprecated Internal bridge for old MDAST callbacks; use compileContentMarkdown and renderMarkdownNodes component overrides. */
export function compileLegacyMarkdownPreview(
  children: RootContent[],
  resolveRenderer: LegacyMarkdownRenderer,
  options: MarkdownCompileOptions,
): {
  readonly hast: Root;
  readonly renderers: ReadonlyMap<string, () => ReactNode>;
} {
  const cloned = structuredClone(children);
  const nodeKeys = new WeakMap<RootContent, string>();
  const handlers: Handlers = {};
  const { root: _root, ...nodeHandlers } = defaultHandlers;
  const defaults: Handlers = nodeHandlers;
  const renderers = new Map<string, () => ReactNode>();

  const handler: Handler = (state, node: RootContent, parent) => {
    const fallback = defaults[node.type];
    let result;
    if (fallback) {
      result = fallback(state, node, parent);
    } else {
      if (!isPageDirective(node))
        throw new Error("GovBB Markdown: missing legacy preview handler");
      const element: Element = {
        type: "element",
        tagName: "div",
        properties: {},
        children: state.all(node),
      };
      state.patch(node, element);
      result = state.applyData(node, element);
    }
    const key = nodeKeys.get(node);
    if (key === undefined) return result;

    const element: Element =
      result && !Array.isArray(result) && result.type === "element"
        ? result
        : {
            type: "element",
            tagName: "span",
            properties: {},
            children:
              result && !Array.isArray(result) && result.type === "text"
                ? [result]
                : [],
          };
    element.properties.dataGovbbmarkdRenderer = key;
    return element;
  };

  function visit(
    nodes: RootContent[],
    visitor: (node: RootContent, key: string) => void,
    prefix = "",
  ): void {
    nodes.forEach((node, index) => {
      const key = `${prefix}${index}`;
      visitor(node, key);
      if ("children" in node) visit(node.children, visitor, `${key}-`);
    });
  }
  visit(children, (node, key) => {
    const render = resolveRenderer(node, key);
    if (render) renderers.set(key, render);
  });
  visit(cloned, (node, key) => {
    if (renderers.has(key)) {
      nodeKeys.set(node, key);
      handlers[node.type] = handler;
    }
  });

  return {
    hast: compileMarkdownTree(
      { type: "root", children: cloned },
      options.html ?? "escape",
      handlers,
    ),
    renderers,
  };
}
