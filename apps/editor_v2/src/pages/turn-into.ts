import {
  $createListItemNode,
  $createListNode,
  $isListItemNode,
  $isListNode,
  type ListNode,
} from "@lexical/list";
import {
  $createHeadingNode,
  $createQuoteNode,
  $isHeadingNode,
  $isQuoteNode,
  type HeadingTagType,
} from "@lexical/rich-text";
import {
  $createParagraphNode,
  $getEditor,
  $getSelection,
  $isElementNode,
  $isParagraphNode,
  $isRangeSelection,
  type ElementNode,
  type LexicalNode,
} from "lexical";
import { editorDefinition } from "../editor/core/context";
import type { TurnInto, TurnIntoChoice } from "../editor/core/turn-into";
import { $liftLine } from "./insertion";
import { $nearestPageList, $setPageListType } from "./modules/lists";
import { PageComponentNode } from "./nodes";

// A page's text blocks, by the ids of the actions that insert them, with their shortcuts. Text comes first
const shortcuts = new Map<string, readonly string[]>([
  ["page-paragraph", ["mod", "alt", "0"]],
  ["page-h2", ["mod", "alt", "2"]],
  ["page-h3", ["mod", "alt", "3"]],
  ["page-h4", ["mod", "alt", "4"]],
  ["page-quote", ["mod", "shift", "b"]],
  ["page-bullet-list", ["mod", "shift", "8"]],
  ["page-number-list", ["mod", "shift", "7"]],
]);

const tags = new Map<string, HeadingTagType>(
  (["h1", "h2", "h3", "h4", "h5", "h6"] as const).map((tag) => [`page-${tag}`, tag]),
);

// A line of text: a paragraph, a heading, or a list item holding its text itself
const $isLine = (node: LexicalNode): node is ElementNode =>
  $isParagraphNode(node) ||
  $isHeadingNode(node) ||
  ($isListItemNode(node) &&
    node.getChildren().every((child) => !$isElementNode(child) || child.isInline()));

// Buttons and table cells hold text that can't turn into anything else
const $fixed = (node: LexicalNode) =>
  node.getType() === "tablecell" ||
  (node instanceof PageComponentNode &&
    (node.getKind() === "start" || node.getKind() === "action"));

/** The line a node is in, null if none, or undefined where its text can't turn. */
function $lineOf(node: LexicalNode): ElementNode | null | undefined {
  let line: ElementNode | null = null;

  for (let current: LexicalNode | null = node; current; current = current.getParent()) {
    if ($fixed(current)) return undefined;

    if (!line && $isLine(current)) line = current;
  }

  return line;
}

/** The lines in a block, in order, as Turn into in its menu takes them all; null if any can't turn. */
export function $blockLines(block: LexicalNode): ElementNode[] | null {
  if ($fixed(block)) return null;

  if ($isLine(block)) return [block];

  const lines = $isElementNode(block) ? block.getChildren().map($blockLines) : [];

  return lines.every((found) => found !== null) ? lines.flat() : null;
}

/** The lines a selection touches, in order; null if any can't turn. */
function $selectedLines(): ElementNode[] | null {
  const selection = $getSelection();

  if (!$isRangeSelection(selection)) return null;
  const lines: ElementNode[] = [];

  for (const node of selection.getNodes()) {
    const line = $lineOf(node);

    if (line === undefined) return null;

    if (line && !lines.some((known) => known.is(line))) lines.push(line);
  }

  return lines.length ? lines : null;
}

/** The type of text a line is, by the id of the action that inserts it. */
function $textType(line: ElementNode) {
  if ($isHeadingNode(line)) return `page-${line.getTag()}`;

  if ($isListItemNode(line) || $isListItemNode(line.getParent()))
    return $nearestPageList(line)?.getListType() === "number"
      ? "page-number-list"
      : "page-bullet-list";

  return $isQuoteNode(line.getParent()) ? "page-quote" : "page-paragraph";
}

/** What a page's lines can turn into, and what they all are: the page's text blocks, each with its shortcut. */
export function $pageChoices(lines: readonly ElementNode[]) {
  const types = new Set(lines.map($textType));
  const value = types.size === 1 ? [...types][0]! : null;

  const choices: TurnIntoChoice[] = editorDefinition($getEditor()).actions.flatMap((action) => {
    const keys = shortcuts.get(action.id);

    // Heading 4 is in the menus only where a line already is one, as the "/" menu finds it only by a search
    return keys
      ? [
          {
            value: action.id,
            label: action.title,
            icon: action.icon,
            keys,
            searchOnly: action.searchOnly,
          },
        ]
      : [];
  });

  // A heading the menus no longer offer, such as one from an older page, still shows what the line is
  if (value && tags.has(value) && !choices.some((choice) => choice.value === value))
    choices.push({ value, label: `Heading ${value.slice(-1)}` });

  return { value, choices };
}

// Turning into text, a heading or a quote takes lines out of the lists and quotes around them
const $leaves = (node: LexicalNode) =>
  $isListNode(node) || $isListItemNode(node) || $isQuoteNode(node);

/** The line out of its lists and quotes, as a paragraph or a heading with its text. */
function $retype(line: ElementNode, tag?: HeadingTagType) {
  const moved = $liftLine(line, $leaves);
  const same = $isHeadingNode(moved) ? moved.getTag() === tag : !tag && $isParagraphNode(moved);

  return same ? moved : moved.replace(tag ? $createHeadingNode(tag) : $createParagraphNode(), true);
}

/** Joins a list to one of its type just before it, and to one just after unless that starts at a number of its own. */
function $joinLists(list: ListNode) {
  const before = list.getPreviousSibling();
  let joined = list;

  if ($isListNode(before) && before.getListType() === list.getListType()) {
    before.append(...list.getChildren());
    list.remove();
    joined = before;
  }

  const after = joined.getNextSibling();

  if (
    $isListNode(after) &&
    after.getListType() === joined.getListType() &&
    after.getStart() === 1
  ) {
    joined.append(...after.getChildren());
    after.remove();
  }
}

/**
 * Turns lines into one of a page's text types, keeping their text: lines leave the lists and quotes
 * around them, which split where they were; lines turned into a list join one next to them, and a line in a list
 * changes its whole list's type; lines turned into a quote together share one.
 */
export function $turnPageLines(lines: readonly ElementNode[], type: string) {
  const listType =
    type === "page-number-list" ? "number" : type === "page-bullet-list" ? "bullet" : null;

  let quote: ElementNode | null = null;
  let last: ElementNode | null = null;

  for (const line of lines) {
    if (!line.isAttached()) continue;

    if (listType && ($isListItemNode(line) || $isListItemNode(line.getParent()))) {
      $setPageListType(line, listType);
      last = line;
    } else if (listType) {
      const text = $retype(line);

      const list = $createListNode(listType).append(
        $createListItemNode().append(...text.getChildren()),
      );

      last = list;
      text.replace(list);
      $joinLists(list);
    } else if (type === "page-quote") {
      const text = $retype(line);

      // Lines turned together go in one quote
      if (quote?.is(text.getPreviousSibling())) quote.append(text);
      else {
        quote = $createQuoteNode();
        text.replace(quote);
        quote.append(text);
      }

      last = text;
    } else last = $retype(line, tags.get(type));
  }

  // The caret stays in the text; one on a line that's gone goes to the end of what it became
  const selection = $getSelection();

  if (
    $isRangeSelection(selection) &&
    !selection.anchor.getNode().isAttached() &&
    last?.isAttached()
  )
    last.selectEnd();
}

/** Turn into, for a page: its text, headings, quotes and lists. */
export const pageTurnInto: TurnInto = {
  $choices() {
    const lines = $selectedLines();

    return lines && $pageChoices(lines);
  },
  $turnInto(value) {
    const lines = $selectedLines();

    if (lines) $turnPageLines(lines, value);
  },
};
