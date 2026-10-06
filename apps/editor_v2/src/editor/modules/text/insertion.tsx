import { $createParagraphNode } from "lexical";
import { TextT } from "@phosphor-icons/react";
import type { ContentEntry } from "../formatting/insertion";

export const textEntries: readonly ContentEntry[] = [
  {
    id: "TEXT",
    title: "Text",
    icon: <TextT />,
    kind: "paragraph",
    create: () => [$createParagraphNode()],
    description:
      "Body text for guidance. Between a question label and its input, it becomes the question’s hint, so keep it short.",
    sample: { text: "You will need your National ID card and a recent utility bill." },
    renderPreview: ({ text }) => <p className="leading-[1.5]">{text}</p>,
  },
];
