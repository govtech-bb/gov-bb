import { ListBullets, ListNumbers } from "@phosphor-icons/react";
import {
  $createListNode,
  $createListItemNode,
  $isListNode,
  $isListItemNode,
  ListNode,
  ListItemNode,
  ListExtension,
} from "@lexical/list";
import { $isParagraphNode } from "lexical";
import type { BlockContent, ListItem } from "mdast";
import type { PageModule, PageHandler } from "../definition";
import { PageListItemNode } from "../list-item";
import { pageInsertAction } from "../insertion";
import { blocks, phrasing, UnsupportedPageContent } from "../markdown";

const lists: PageHandler = {
  accepts: (node) => node.type === "list" || node.type === "listItem",
  owns: (node) => $isListNode(node) || $isListItemNode(node),
  $import(node, context) {
    if (node.type === "list") {
      if (node.children.some((item) => item.checked !== null && item.checked !== undefined))
        throw new UnsupportedPageContent(node, "Task lists need Markdown source editing");

      return [
        $createListNode(node.ordered ? "number" : "bullet", node.start ?? 1).append(
          ...node.children.flatMap((child) => context.$import(child)),
        ),
      ];
    }

    if (node.type === "listItem") {
      const item = new PageListItemNode();
      const imported = node.children.flatMap((child) => context.$import(child));
      const nested = [];

      // Lexical edits trailing sublists as wrapper siblings, separate from the item's text.
      while ($isListNode(imported.at(-1))) nested.unshift(imported.pop()!);

      // A single paragraph uses Lexical's usual inline item shape; multiple blocks retain their hierarchy.
      for (const child of imported) {
        if (node.children.length === 1 && $isParagraphNode(child))
          item.append(...child.getChildren());
        else item.append(child);
      }

      return [item, ...nested.map((list) => new PageListItemNode().append(list))];
    }

    throw new UnsupportedPageContent(node);
  },
  $export(node, context) {
    if ($isListNode(node)) {
      const children: ListItem[] = [];

      for (const child of node.getChildren()) {
        const previous = children.at(-1);
        const nested = $isListItemNode(child) ? child.getFirstChild() : null;

        if (
          previous &&
          $isListItemNode(child) &&
          child.getChildrenSize() === 1 &&
          $isListNode(nested)
        ) {
          previous.children.push(...blocks(context.$export(nested)));
          previous.spread = true;
        } else {
          for (const item of context.$export(child)) {
            if (item.type !== "listItem") throw new Error("A list must contain list items");
            children.push(item);
          }
        }
      }

      return [
        {
          type: "list",
          ordered: node.getListType() === "number",
          start: node.getListType() === "number" ? node.getStart() : null,
          spread: false,
          children,
        },
      ];
    }

    if ($isListItemNode(node)) {
      const children: BlockContent[] = [];
      let inline: import("mdast").PhrasingContent[] = [];

      const flush = () => {
        if (inline.length) {
          children.push({ type: "paragraph", children: inline });
          inline = [];
        }
      };

      for (const child of node.getChildren().flatMap((child) => context.$export(child))) {
        if (
          [
            "paragraph",
            "heading",
            "blockquote",
            "list",
            "thematicBreak",
            "table",
            "containerDirective",
            "leafDirective",
          ].includes(child.type) ||
          (child.type === "html" && child.value.startsWith("<a data-start-link"))
        ) {
          flush();
          // SAFETY: The block variants above are valid mdast list-item children.
          children.push(child as BlockContent);
        } else inline.push(...phrasing([child]));
      }

      flush();

      return [{ type: "listItem", spread: children.length > 1, children }];
    }

    throw new Error("Unsupported list node");
  },
  render(node, context, key) {
    if (node.type === "listItem")
      return (
        <li key={key}>
          {node.children.map((child, index) => context.render(child, `${key}/${index}`))}
        </li>
      );

    if (node.type === "list") {
      const children = node.children.map((child, index) =>
        context.render(child, `${key}/${index}`),
      );

      return node.ordered ? (
        <ol key={key} start={node.start ?? undefined}>
          {children}
        </ol>
      ) : (
        <ul key={key}>{children}</ul>
      );
    }

    throw new UnsupportedPageContent(node);
  },
};

export function PageListsModule(): PageModule {
  return {
    key: "page-lists",
    requires: ["text"],
    nodes: [
      { type: "list", node: ListNode },
      { type: "listitem", node: ListItemNode },
      { type: "page-listitem", node: PageListItemNode },
    ],
    browserExtensions: [ListExtension],
    markdown: [lists],
    actions: [
      pageInsertAction(
        "page-bullet-list",
        "Bulleted list",
        () => $createListNode("bullet").append($createListItemNode()),
        {
          group: "Lists",
          order: 20,
          icon: <ListBullets />,
          description: "List items in any order.",
        },
      ),
      pageInsertAction(
        "page-number-list",
        "Numbered list",
        () => $createListNode("number").append($createListItemNode()),
        {
          group: "Lists",
          order: 20,
          icon: <ListNumbers />,
          description: "Write a sequence of steps.",
        },
      ),
    ],
    theme: {
      list: {
        ul: "page-list page-list-bullet",
        ol: "page-list page-list-number",
        listitem: "page-list-item",
        nested: { listitem: "page-list-nested" },
      },
    },
  };
}
