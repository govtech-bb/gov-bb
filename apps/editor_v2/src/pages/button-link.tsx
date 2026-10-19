import {
  $findMatchingParent,
  $getNodeByKey,
  COMMAND_PRIORITY_HIGH,
  type LexicalNode,
  type NodeKey,
} from "lexical";
import { CaretLinkPopover } from "../editor/react/caret-link";
import { linkAddress } from "../editor/modules/links/url";
import { safePageUrl } from "./modules/text";
import { PageComponentNode } from "./nodes";

// A Start button or an Action button: the page's buttons with an address
const $isButton = (node: LexicalNode | null): node is PageComponentNode =>
  node instanceof PageComponentNode && (node.getKind() === "start" || node.getKind() === "action");

function $findButton(node: LexicalNode) {
  const button = $findMatchingParent(node, $isButton);

  if (!$isButton(button)) return null;
  const { href } = button.getAttributes();

  // A Start button without an address goes to the service's form; an Action button always has one
  return { key: button.getKey(), url: href, removable: button.getKind() === "start" && !!href };
}

function $applyButton(key: NodeKey, url: string) {
  const button = $getNodeByKey(key);

  if ($isButton(button)) button.setAttributes({ ...button.getAttributes(), href: url });
}

function $removeButton(key: NodeKey) {
  const button = $getNodeByKey(key);

  if ($isButton(button)) button.setAttributes({ ...button.getAttributes(), href: undefined });
}

/**
 * Where the Start or Action button at the caret goes, with Edit, and for a Start button "Use linked form"; ⌘K edits
 * it. It comes before the text link's, as a button's words can't hold a link.
 */
export function PageButtonLink() {
  return (
    <CaretLinkPopover
      $find={$findButton}
      $apply={$applyButton}
      $remove={$removeButton}
      toAddress={(typed) => linkAddress(typed, safePageUrl)}
      priority={COMMAND_PRIORITY_HIGH}
      fallback="Linked form"
      label="Button destination"
      editLabel="Change destination"
      removeLabel="Use linked form"
    />
  );
}
