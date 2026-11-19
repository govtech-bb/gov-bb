import { $createLinkNode, $isLinkNode } from "@lexical/link";
import {
  $createTextNode,
  $findMatchingParent,
  $getNodeByKey,
  $getSelection,
  $isRangeSelection,
  type LexicalNode,
  type NodeKey,
} from "lexical";
import { useCallback } from "react";
import { CaretLinkPopover } from "../../react/caret-link";
import { isSafeLinkUrl, linkAddress } from "../links/url";
import { $formattable, type ToolbarPolicy } from "./toolbar";

// As the toolbar makes them
const attributes = { target: "_blank", rel: "noopener noreferrer" };

const richText = () => false;

function $findLink(node: LexicalNode) {
  const link = $findMatchingParent(node, $isLinkNode);

  return link ? { key: link.getKey(), url: link.getURL(), removable: true } : null;
}

function $applyLink(key: NodeKey, url: string) {
  const link = $getNodeByKey(key);

  if ($isLinkNode(link)) link.setURL(url);
}

// A link gives way to its words
function $removeLink(key: NodeKey) {
  const link = $getNodeByKey(key);

  if (!$isLinkNode(link)) return;

  for (const child of link.getChildren()) link.insertBefore(child);
  link.remove();
}

// A new link's words go in at the caret, and typing goes on after them
function $insertLink(url: string, text: string) {
  const selection = $getSelection();

  if (!$isRangeSelection(selection)) return;
  const link = $createLinkNode(url, attributes).append($createTextNode(text));
  selection.insertNodes([link]);
  link.selectNext(0, 0);
}

/** The text link at the caret, with its address, Edit and Remove; ⌘K away from a link makes one at the caret. */
export function TextLinkAtCaret({
  isPlainText = richText,
  isValidLink = isSafeLinkUrl,
}: ToolbarPolicy) {
  const $canInsert = useCallback(() => !!$formattable(isPlainText), [isPlainText]);

  return (
    <CaretLinkPopover
      $find={$findLink}
      $apply={$applyLink}
      $remove={$removeLink}
      $canInsert={$canInsert}
      $insert={$insertLink}
      toAddress={(typed) => linkAddress(typed, isValidLink)}
    />
  );
}
