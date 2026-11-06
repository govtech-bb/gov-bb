import { $createParagraphNode } from "lexical";
import { TextT } from "@phosphor-icons/react";
import type { ContentEntry } from "./content-insertion";
import { defineTextContent } from "./define-content";

export const textEntries: readonly ContentEntry[] = [
  {
    id: "TEXT",
    title: "Text",
    icon: <TextT />,
    aliases: ["paragraph", "plain text"],
    kind: "paragraph",
    create: () => [$createParagraphNode()],
    description:
      "Body text for guidance. Between a question label and its input, it becomes the question’s hint, so keep it short.",
    sample: { text: "You will need your National ID card and a recent utility bill." },
    renderPreview: ({ text }) => <p className="leading-[1.5]">{text}</p>,
  },
];

export const paragraphContent = defineTextContent(
  "paragraph",
  "Text",
  { storage: { type: "paragraph" }, syntax: { type: "paragraph" } },
  { kind: "paragraph", order: 0, create: $createParagraphNode },
);
