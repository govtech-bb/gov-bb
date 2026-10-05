import { BookmarkSimple } from "@phosphor-icons/react";
import { $createQuestionNode } from "../nodes";
import { defineContent } from "../../content";
import { nativeContent } from "../../native";

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
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none mt-5 rounded-sm bg-grey-10 p-4 select-none"
    >
      <div className="overflow-hidden rounded-sm bg-white p-5 text-(length:--form-text) shadow-sheet [--form-control:2.75rem] [--form-marker:1.75rem] [--form-text:1rem]">
        <div className="font-bold leading-[1.5]">{questionLabelEntry.sample.label}</div>
      </div>
    </div>
  );
}
