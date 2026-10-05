import { CaretCircleRight } from "@phosphor-icons/react";
import { $createShowHideNode } from "./nodes";
import { $createParagraphNode } from "lexical";
import { $setDepth } from "../../core/document-state";
import type { ContentEntry } from "../formatting/insertion";

export const disclosureEntries: readonly ContentEntry[] = [
  {
    id: "SHOW_HIDE",
    title: "Details",
    icon: <CaretCircleRight />,
    keywords: "show/hide, expandable help, details, disclosure, toggle, expand, collapse, more",
    kind: "show-hide",
    renderPreview: ({ label, text }) => (
      <>
        <div className="flex items-center gap-2 text-interactive underline underline-offset-[0.1em]">
          <span className="h-0 w-0 rotate-90 border-y-[5px] border-l-[7px] border-y-transparent border-l-current" />
          {label}
        </div>
        <div className="mt-2 border-l-4 border-line pl-5 leading-[1.5]">{text}</div>
      </>
    ),
    create: () => [$createShowHideNode(), $setDepth($createParagraphNode(), 1)],
    description:
      "A link that opens extra help only some people need, such as what a word means. Name what it reveals, like ‘What is a parish?’, and never hide something most people need.",
    sample: {
      label: "What is a parish?",
      text: "Barbados has 11 parishes, such as Christ Church and Saint Michael.",
    },
  },
];
