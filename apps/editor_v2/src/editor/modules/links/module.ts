import { LinkExtension, LinkNode, TOGGLE_LINK_COMMAND } from "@lexical/link";
import {
  $addUpdateTag,
  COMMAND_PRIORITY_CRITICAL,
  HISTORY_PUSH_TAG,
  mergeRegister,
  type LexicalEditor,
} from "lexical";
import type { EditorModule } from "../../core/module";
import { toast } from "../../../ui/toast";
import { isSafeLinkUrl } from "./url";

export const linkTheme =
  "cursor-pointer text-interactive underline decoration-1 underline-offset-[0.15em] hover:bg-interactive-subtle hover:text-ink";

/** isValidLink: the addresses the document can keep, such as only those its Markdown can save. */
export function LinksModule({
  isValidLink = isSafeLinkUrl,
}: { isValidLink?: (url: string) => boolean } = {}): EditorModule {
  return {
    key: "links",
    requires: ["text"],
    provides: ["links"],
    nodes: [{ type: "link", node: LinkNode }],
    registrations: [
      {
        key: "link-policy",
        phase: "browser",
        register: (editor) => registerLinkPolicy(editor, isValidLink),
      },
      { key: "link-history", phase: "document", register: registerLinkHistory },
    ],
    browserExtensions: [LinkExtension],
    theme: { link: linkTheme },
  };
}

/** Adding, changing or removing a link is an undo step of its own, like a format change. */
export function registerLinkHistory(editor: LexicalEditor) {
  return editor.registerCommand(
    TOGGLE_LINK_COMMAND,
    () => {
      $addUpdateTag(HISTORY_PUSH_TAG);

      return false;
    },
    COMMAND_PRIORITY_CRITICAL,
  );
}

/**
 * Keeps only the links the document can use. Any other, such as a javascript: or file: link pasted from another app,
 * gives way to its text, so the document can still be saved and opened, and the writer is told once for each change.
 */
export function registerLinkPolicy(
  editor: LexicalEditor,
  isValidLink: (url: string) => boolean,
  notify = () =>
    toast("Link removed", {
      description: "Its address can't be used on GOV.BB, so only its text was kept.",
      tone: "info",
    }),
) {
  let removed = false;

  return mergeRegister(
    editor.registerNodeTransform(LinkNode, (link) => {
      if (isValidLink(link.getURL())) return;

      for (const child of link.getChildren()) link.insertBefore(child);
      link.remove();
      removed = true;
    }),
    editor.registerUpdateListener(() => {
      if (!removed) return;
      removed = false;
      notify();
    }),
  );
}
