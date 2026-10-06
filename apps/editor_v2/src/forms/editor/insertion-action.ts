import type { ReactNode } from "react";
import type { EditorAction } from "../../editor/core/actions";
import { $insertBlocks, type Entry } from "./insertion";
import { $addFollowUp } from "./nesting";
import { $isOptionNode } from "./nodes";
import { $finishFollowUp, focusLogic } from "../features/logic/authoring";
import { $canInsertFormAction } from "./insertion-context";

export function formInsertionAction(
  entry: Omit<Entry, "icon"> & { icon?: ReactNode },
  group: string,
  order: number,
  preview: ReactNode,
): EditorAction {
  return {
    id: entry.id,
    title: entry.title,
    group,
    order,
    icon: entry.icon,
    description: entry.description,
    keywords: entry.keywords,
    preview,
    $available: (context) =>
      $canInsertFormAction(
        context,
        group === "Questions"
          ? "question"
          : group === "Answer inputs"
            ? "answer"
            : group === "Layout blocks"
              ? "layout"
              : group === "Form registry"
                ? "registry"
                : "advanced",
        entry.kind,
      ) &&
      (entry.available?.() ?? true),
    $execute: ({ editor, target, request }) => {
      const option = request.mode === "follow-up" && $isOptionNode(target) ? target : null;
      const into = option ? $addFollowUp(option) : target;
      const created = entry.create();
      $insertBlocks(created, into);
      const rule = option ? $finishFollowUp(option, created) : undefined;

      return rule ? { afterClose: () => focusLogic(editor, rule) } : undefined;
    },
  };
}
