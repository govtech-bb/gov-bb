import { $createLinkNode, $isLinkNode } from "@lexical/link";
import {
  $addUpdateTag,
  $findMatchingParent,
  $getNodeByKey,
  $getSelection,
  $isElementNode,
  $isParagraphNode,
  $isRangeSelection,
  $isTextNode,
  COLLABORATION_TAG,
  HISTORIC_TAG,
  HISTORY_MERGE_TAG,
  HISTORY_PUSH_TAG,
  PASTE_TAG,
  type EditorState,
  type ElementNode,
  type LexicalEditor,
  type NodeKey,
  type TextNode,
} from "lexical";
import { $executeAction } from "../../core/actions";
import { editorDefinition } from "../../core/context";
import { isSafeLinkUrl, normalizeLinkUrl } from "../links/url";

// Markdown's other ways of writing a marker the menus show: * or + for a bullet, and any number for a step
const sameMarker = (marker: string) =>
  /^[*+]$/.test(marker) ? "-" : /^\d+\.$/.test(marker) ? "1." : marker;

// A separator holds no text, so its marker converts without a space after it
const separator = /^(?:-{3,}|\*{3,}|_{3,})$/;

// [text](address), as Markdown writes a link
const markdownLink = /\[([^\]\n]+)\]\(([^()\s]+)\)/g;

/** Where a character was just typed in a text node, as Lexical's own Markdown shortcuts tell typing from a paste. */
function typedCaret(state: EditorState, previous: EditorState, dirty: Set<NodeKey>) {
  const caret = (editorState: EditorState) =>
    editorState.read(() => {
      const selection = $getSelection();

      return $isRangeSelection(selection) && selection.isCollapsed()
        ? {
            key: selection.anchor.key,
            offset: selection.anchor.offset,
            type: selection.anchor.type,
          }
        : null;
    });

  const now = caret(state);
  const before = caret(previous);

  return now?.type === "text" &&
    dirty.has(now.key) &&
    (now.offset === 1 || (before?.key === now.key && before.offset === now.offset - 1))
    ? now
    : null;
}

/**
 * Turns each `[text](address)` in a text node into a link, from the last, where the link policy allows its address;
 * with `end`, only one that ends there, where it was just typed.
 */
function $linkMarkdown(node: TextNode, isValidLink: (url: string) => boolean, end?: number) {
  if (node.hasFormat("code") || $findMatchingParent(node, $isLinkNode)) return;
  const text = node.getTextContent().slice(0, end);
  const found = [...text.matchAll(markdownLink)];

  for (const match of end === undefined ? found.toReversed() : found.slice(-1)) {
    const url = normalizeLinkUrl(match[2]!);
    const start = match.index;
    const stop = start + match[0].length;

    if ((end !== undefined && stop !== end) || !url || !isValidLink(url)) continue;
    const parts = node.splitText(start, stop);
    const words = parts[start ? 1 : 0]!;
    const link = $createLinkNode(url);

    words.replace(link);
    link.append(words.setTextContent(match[1]!));

    // Typing goes on after the link, not in it
    if (end !== undefined) link.selectNext(0, 0);
  }
}

type LinkPolicy = { linksEnabled?: boolean; isValidLink?: (url: string) => boolean };

/** What was just typed, at `offset` in a text node: a link's Markdown, or a block's at the start of a line. */
function $convertTyped(
  editor: LexicalEditor,
  key: NodeKey,
  offset: number,
  { linksEnabled = true, isValidLink = isSafeLinkUrl }: LinkPolicy,
) {
  const node = $getNodeByKey(key);

  if (!$isTextNode(node) || $findMatchingParent(node, $isLinkNode)) return;
  const typed = node.getTextContent().slice(0, offset);

  if (linksEnabled && typed.endsWith(")")) {
    // A step of its own, so Undo gives back the Markdown
    $addUpdateTag(HISTORY_PUSH_TAG);
    $linkMarkdown(node, isValidLink, offset);

    return;
  }

  const line = $findMatchingParent(
    node,
    (parent): parent is ElementNode => $isElementNode(parent) && !parent.isInline(),
  );

  // A marker is the line's first text
  if (!line || !line.getFirstDescendant()?.is(node)) return;
  const definition = editorDefinition(editor);
  const spaced = typed.endsWith(" ");
  const marker = spaced ? sameMarker(typed.slice(0, -1)) : separator.test(typed) ? "---" : "";
  const action = marker && definition.actions.find((item) => item.markdown === marker);

  if (!action) return;
  const offer = definition.turnInto?.$choices();

  if (spaced && offer?.choices.some((choice) => choice.value === action.id)) {
    if (offer.value === action.id) return;
    // A step of its own, so Undo gives back the Markdown
    $addUpdateTag(HISTORY_PUSH_TAG);

    if (node.getTextContentSize() > offset) node.spliceText(0, offset, "", true);
    else {
      node.remove();
      line.selectStart();
    }

    definition.turnInto!.$turnInto(action.id);
  } else if ($isParagraphNode(line) && line.getTextContent() === typed)
    $executeAction(editor, definition, action.id, { targetKey: line.getKey(), typed }, () =>
      node.remove(),
    );
}

/**
 * Markdown typed at the start of a line: a block's Markdown (the menus show it beside the
 * block), then a space, turns the line into that type through Turn into, keeping its text; on an empty line a block
 * that isn't text, such as a separator, takes the line's place. `[text](address)` becomes a link when it's typed or
 * pasted, where the link policy allows its address. Only typing converts, so an undo back to the Markdown leaves it,
 * and Undo straight after a conversion gives back what was typed.
 */
export function registerMarkdownShortcuts(editor: LexicalEditor, policy: LinkPolicy = {}) {
  const { linksEnabled = true, isValidLink = isSafeLinkUrl } = policy;

  return editor.registerUpdateListener(({ tags, dirtyLeaves, editorState, prevEditorState }) => {
    if (
      tags.has(HISTORIC_TAG) ||
      tags.has(COLLABORATION_TAG) ||
      editor.isComposing() ||
      !editor.isEditable()
    )
      return;

    if (tags.has(PASTE_TAG)) {
      // The text the paste brought, rather than any it only split
      const text = (state: EditorState, key: NodeKey) =>
        state.read(() => $getNodeByKey(key)?.getTextContent());

      const pasted = [...dirtyLeaves].filter(
        (key) => text(editorState, key) !== text(prevEditorState, key),
      );

      if (linksEnabled && pasted.length)
        editor.update(() => {
          // The paste and its links are one undo step
          $addUpdateTag(HISTORY_MERGE_TAG);

          for (const key of pasted) {
            const node = $getNodeByKey(key);

            if ($isTextNode(node) && node.isAttached()) $linkMarkdown(node, isValidLink);
          }
        });

      return;
    }

    const caret = typedCaret(editorState, prevEditorState, dirtyLeaves);

    if (caret) editor.update(() => $convertTyped(editor, caret.key, caret.offset, policy));
  });
}
