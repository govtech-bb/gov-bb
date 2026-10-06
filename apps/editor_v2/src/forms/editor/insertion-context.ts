import { $isHeadingNode } from "@lexical/rich-text";
import { $isParagraphNode, type LexicalNode } from "lexical";
import type { ActionContext } from "../../editor/core/actions";
import {
  $blockGroup,
  $depth,
  $isFormTitleNode,
  $isInput,
  $isPageBreak,
  $isQuestionNode,
  $pageType,
  confirmationContentKinds,
} from "./nodes";
import { $canAddFollowUp } from "./nesting";

export type FormInsertionRole = "question" | "answer" | "layout" | "registry" | "advanced";

export function $formInsertionContext(block: LexicalNode | null | undefined) {
  let page = block;

  while (page && !$isPageBreak(page) && !$isFormTitleNode(page)) page = page.getPreviousSibling();
  const confirmation = !!page && $pageType(page) === "confirmation";

  if (!block || !($isQuestionNode(block) || $isParagraphNode(block)))
    return { confirmation, answer: false };
  const depth = $depth(block);
  let title: LexicalNode | null = block;

  while (title && $depth(title) === depth && ($isParagraphNode(title) || $isHeadingNode(title)))
    title = title.getPreviousSibling();

  const answer =
    $isQuestionNode(title) && $depth(title) === depth && !$blockGroup(title).some($isInput);

  return { confirmation, answer };
}

/** Field modules supply semantic roles; policy never needs their action IDs. */
export function $canInsertFormAction(
  { target, request }: ActionContext,
  role: FormInsertionRole,
  kind?: string,
) {
  if (
    request.mode === "follow-up" &&
    (!$canAddFollowUp(target) || role === "advanced" || kind === "page-break")
  )
    return false;
  const context = $formInsertionContext(target);

  if (context.confirmation)
    return role === "layout" && (kind === "page-break" || confirmationContentKinds.has(kind ?? ""));

  return role === "answer" ? context.answer : role === "question" ? !context.answer : true;
}
