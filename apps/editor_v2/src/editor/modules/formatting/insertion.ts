import {
  $addUpdateTag,
  $isElementNode,
  $isParagraphNode,
  HISTORY_PUSH_TAG,
  type LexicalNode,
} from "lexical";
import type { ReactNode } from "react";
import type { EditorAction } from "../../core/actions";
import { $depth, $setDepth } from "../../core/document-state";

export type ContentEntry = {
  id: string;
  title: string;
  kind: string;
  icon: ReactNode;
  description: string;
  keywords?: string;
  sample?: { label?: string; hint?: string; options?: string[]; text?: string; items?: string[] };
  shortcuts?: readonly string[];
  renderPreview?: (sample: NonNullable<ContentEntry["sample"]>) => ReactNode;
  create: () => LexicalNode[];
};

/** The content preset's flat insertion; form composition supplies its own context-aware adapter. */
export function $insertContent(created: LexicalNode[], target: LexicalNode) {
  if (!created.length) return;
  $addUpdateTag(HISTORY_PUSH_TAG);
  const replacing = $isParagraphNode(target) && target.isEmpty();
  const next = target.getNextSibling();
  const depth = $depth(target) + (!replacing && next && $depth(next) > $depth(target) ? 1 : 0);
  const relative = $depth(created[0]!);

  for (const node of created) $setDepth(node, depth + $depth(node) - relative);

  if (replacing) target.replace(created[0]!);
  else target.insertAfter(created[0]!);

  for (let i = 1; i < created.length; i++) created[i - 1]!.insertAfter(created[i]!);
  const first = created[0]!;

  if ($isElementNode(first)) first.selectStart();
}

export function contentActions(entries: readonly ContentEntry[]): EditorAction[] {
  return entries.map((entry) => ({
    ...entry,
    group: "Content",
    preview: entry.renderPreview?.(entry.sample ?? {}),
    $available: ({ target }) => target.getParent()?.getType() === "root",
    $execute: ({ target }) => {
      $insertContent(entry.create(), target);
    },
  }));
}
