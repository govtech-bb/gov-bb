import { container, ghost } from "../../react/block-dom";
import { registerRichText } from "@lexical/rich-text";
import {
  $createParagraphNode,
  $getRoot,
  LineBreakNode,
  ParagraphNode,
  TabNode,
  TextNode,
} from "lexical";
import type { DocumentNodeDefinition, EditorModule } from "../../core/module";

const textNodes: DocumentNodeDefinition[] = [
  {
    type: "paragraph",
    node: ParagraphNode,
    validate: (node) => (Array.isArray(node.children) ? undefined : "A paragraph needs children"),
  },
  {
    type: "text",
    node: TextNode,
    validate: (node) => (typeof node.text === "string" ? undefined : "A text node needs text"),
  },
  { type: "linebreak", node: LineBreakNode },
  { type: "tab", node: TabNode },
];

export function TextModule({ initialize = true, browser = true } = {}): EditorModule {
  const module: EditorModule = {
    key: "text",
    theme: { paragraph: `${container} ${ghost} pt-1 pb-2 leading-[1.5]` },
    provides: ["text"],
    nodes: textNodes,
    registrations: browser
      ? [{ key: "text-editing", phase: "browser", register: registerRichText }]
      : [],
  };

  if (!initialize) return module;

  return {
    ...module,
    $initialize: () => {
      $getRoot().append($createParagraphNode());
    },
  };
}
