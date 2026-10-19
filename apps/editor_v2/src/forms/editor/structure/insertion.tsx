import { BookmarkSimple } from "@phosphor-icons/react";
import { $createQuestionNode } from "../nodes";
import { defineContent } from "../../content";
import { nativeContent } from "../../native";
import { PreviewQuestion } from "../../../ui/preview-sheet";

export const questionLabelContent = defineContent({
  kind: "title",
  label: "Question label",
  native: nativeContent("title", { kind: "question-label" }),
  turnInto: { kind: "question", order: 1, create: $createQuestionNode },
  icon: <BookmarkSimple />,
  source: { storage: { type: "question" }, syntax: { type: "directive", name: "title" } },
});

export const questionLabelEntry = {
  id: "TITLE",
  title: "Question label",
  icon: <BookmarkSimple />,
  keywords: "question title, legend",
  kind: "question",
  description:
    "The wording of a question, without an input. Insert an answer input beneath it to complete the question.",
  sample: { label: "Which roads do you need to close?" },
  create: () => [$createQuestionNode()],
};

export function QuestionLabelPreview() {
  return <PreviewQuestion label={questionLabelEntry.sample.label} />;
}
