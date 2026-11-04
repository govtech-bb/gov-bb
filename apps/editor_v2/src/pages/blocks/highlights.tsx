import { Plus, SquaresFour } from "@phosphor-icons/react";
import { parseLegacyHighlights, serializeLegacyHighlights } from "@govtech-bb/govbbmarkd/legacy";
import {
  $createTextNode,
  $isElementNode,
  $isLineBreakNode,
  COMMAND_PRIORITY_NORMAL,
  INSERT_PARAGRAPH_COMMAND,
  KEY_BACKSPACE_COMMAND,
  KEY_DELETE_COMMAND,
  mergeRegister,
  TextNode,
  type ElementNode,
  type LexicalEditor,
  type LexicalNode,
} from "lexical";
import { $atEdge, $caretBlock } from "../../editor/modules/formatting/editing";
import { $lineAfter } from "../block-exit";
import { pageInsertAction } from "../insertion";
import { BlockMenuItem, type BlockOptionsProps } from "./block-options";
import { defineBlock } from "./define-block";
import { PageComponentNode } from "./node";
import "./highlights.css";

declare module "./node" {
  interface PageComponentKinds {
    highlights: true;
    highlight: true;
    "highlight-title": true;
    "highlight-text": true;
  }
}

/** A new highlight, its title and text empty to write in. */
export function $createHighlight() {
  return new PageComponentNode("highlight").append(
    new PageComponentNode("highlight-title"),
    new PageComponentNode("highlight-text"),
  );
}

/**
 * A highlight's title or text, which are plain: landing lays a highlight out as a flex column, which would put
 * formatted words on lines of their own.
 */
export const $isHighlightPart = (node: LexicalNode | null | undefined): node is PageComponentNode =>
  node instanceof PageComponentNode &&
  (node.__kind === "highlight-title" || node.__kind === "highlight-text");

// Each highlight in a group holds its title and then its text
function $highlightParts(highlight: LexicalNode) {
  const [title, text, ...rest] =
    highlight instanceof PageComponentNode && highlight.getKind() === "highlight"
      ? highlight.getChildren()
      : [];

  if (
    !$isHighlightPart(title) ||
    title.getKind() !== "highlight-title" ||
    !$isHighlightPart(text) ||
    text.getKind() !== "highlight-text" ||
    rest.length
  )
    throw new Error("A highlight holds its title and then its text");

  return { title, text };
}

/**
 * A highlight keeps its title and then its text, both plain: formatting and links typed or pasted in come off, rather
 * than showing until they fail to save, a line break in a title is the space landing shows, and a highlight that
 * deleting a selection has left with one part gets the other back.
 */
function registerHighlightParts(editor: LexicalEditor) {
  return mergeRegister(
    editor.registerNodeTransform(TextNode, (node) => {
      if (node.getFormat() && $isHighlightPart(node.getParent())) node.setFormat(0);
    }),
    editor.registerNodeTransform(PageComponentNode, (node) => {
      if (!$isHighlightPart(node)) return;

      for (const child of node.getChildren())
        if ($isElementNode(child) && child.isInline()) {
          for (const inner of child.getChildren()) child.insertBefore(inner);
          child.remove();
        } else if ($isLineBreakNode(child) && node.getKind() === "highlight-title")
          child.replace($createTextNode(" "));
    }),
    editor.registerNodeTransform(PageComponentNode, (node) => {
      if (node.getKind() !== "highlight") return;
      const [title, text] = node.getChildren();

      if (!$isHighlightPart(title) || title.getKind() !== "highlight-title")
        node.splice(0, 0, [new PageComponentNode("highlight-title")]);

      if (!$isHighlightPart(text) || text.getKind() !== "highlight-text")
        node.append(new PageComponentNode("highlight-text"));
    }),
  );
}

// Its title and text are both empty: the highlight's own text content has a line break between them
const $isEmpty = (highlight: ElementNode) =>
  highlight.getChildren().every((part) => !part.getTextContentSize());

/**
 * Enter goes from a highlight's title to its text, and from its text to a new highlight; on an empty last highlight it
 * goes on writing below them, as on an empty last list item.
 */
function $enter() {
  const caret = $caretBlock();

  if (!caret || !$isHighlightPart(caret.block)) return false;
  const highlight = caret.block.getParentOrThrow();
  const text = caret.block.getNextSibling();

  if ($isEmpty(highlight) && !highlight.getNextSibling()) {
    const group = highlight.getParentOrThrow();
    highlight.remove();
    $lineAfter(group).select();

    if (group.isEmpty()) group.remove();
  } else if ($isHighlightPart(text)) text.selectStart();
  else {
    const next = $createHighlight();
    highlight.insertAfter(next);
    next.selectStart();
  }

  return true;
}

/**
 * Backspace and Delete stop at the edges of a highlight's title and text, which never join each other or another
 * highlight's: Backspace at the start of the text goes to the end of the title, and in an empty highlight it takes the
 * highlight away.
 */
const $stopAtEdge = (start: boolean) => (event: KeyboardEvent) => {
  const caret = $caretBlock();

  if (!caret || !$isHighlightPart(caret.block) || !$atEdge(caret.selection, caret.block, start))
    return false;
  const highlight = caret.block.getParentOrThrow();
  const title = caret.block.getPreviousSibling();

  event.preventDefault();

  if (start && $isEmpty(highlight)) {
    const previous = highlight.getPreviousSibling();
    const next = highlight.getNextSibling();
    const group = highlight.getParentOrThrow();
    highlight.remove();

    if (previous instanceof PageComponentNode) previous.selectEnd();
    else if (next instanceof PageComponentNode) next.selectStart();
    else {
      $lineAfter(group).select();
      group.remove();
    }
  } else if (start && $isHighlightPart(title)) title.selectEnd();

  return true;
};

function registerHighlightKeys(editor: LexicalEditor) {
  return mergeRegister(
    editor.registerCommand(INSERT_PARAGRAPH_COMMAND, $enter, COMMAND_PRIORITY_NORMAL),
    editor.registerCommand(KEY_BACKSPACE_COMMAND, $stopAtEdge(true), COMMAND_PRIORITY_NORMAL),
    editor.registerCommand(KEY_DELETE_COMMAND, $stopAtEdge(false), COMMAND_PRIORITY_NORMAL),
  );
}

function AddHighlight({ change }: BlockOptionsProps) {
  return (
    <BlockMenuItem
      icon={<Plus />}
      onClick={() =>
        change((node) => {
          const highlight = $createHighlight();

          // After the highlight at the caret, or at the end of the group
          if (node.getKind() === "highlights") node.append(highlight);
          else ($isHighlightPart(node) ? node.getParentOrThrow() : node).insertAfter(highlight);
          highlight.selectStart();
        })
      }
    >
      Add highlight
    </BlockMenuItem>
  );
}

const part = { shadowRoot: false, canBeEmpty: true } as const;

/**
 * `<highlights>` of `<highlight title="…">` cards: landing's HTML, which has no directive. Each highlight holds its
 * title and its text, both written in place.
 */
export const highlights = defineBlock({
  key: "page-highlights",
  kinds: [
    { kind: "highlights" },
    { kind: "highlight" },
    { kind: "highlight-title", ...part },
    { kind: "highlight-text", ...part },
  ],
  markdown: [
    {
      accepts: (node) => !!parseLegacyHighlights(node),
      owns: (node) => node instanceof PageComponentNode && node.getKind() === "highlights",
      $import(node, context) {
        return [
          new PageComponentNode("highlights").append(
            ...(parseLegacyHighlights(node) ?? []).map(({ title, text }) =>
              new PageComponentNode("highlight").append(
                new PageComponentNode("highlight-title").append(
                  ...(title ? [$createTextNode(title)] : []),
                ),
                new PageComponentNode("highlight-text").append(
                  ...text.flatMap((child) => context.$import(child)),
                ),
              ),
            ),
          ),
        ];
      },
      $export(node, context) {
        if (!(node instanceof PageComponentNode)) throw new Error("Expected highlights");

        return [
          {
            type: "html",
            value: serializeLegacyHighlights(
              node.getChildren().map((highlight) => {
                const { title, text } = $highlightParts(highlight);

                return {
                  title: title.getTextContent(),
                  text: text.getChildren().flatMap((child) => context.$export(child)),
                };
              }),
            ),
          },
        ];
      },
    },
  ],
  insert: [
    pageInsertAction(
      "page-highlights",
      "Highlights",
      () => new PageComponentNode("highlights").append($createHighlight()),
      {
        group: "Components",
        order: 40,
        icon: <SquaresFour />,
        description: "Pick out key points, each under a title.",
        aliases: ["key points", "cards", "tiles"],
      },
    ),
  ],
  options: [
    {
      kinds: ["highlights", "highlight", "highlight-title", "highlight-text"],
      Options: AddHighlight,
    },
  ],
  registrations: [
    { key: "highlight-parts", phase: "document", register: registerHighlightParts },
    { key: "highlight-keys", phase: "browser", register: registerHighlightKeys },
  ],
});
