import { Info, WarningCircle } from "@phosphor-icons/react";
import { $createInsetNode, $createWarningNode } from "./nodes";
import type { ContentEntry } from "../formatting/insertion";

export const calloutEntries: readonly ContentEntry[] = [
  {
    id: "INSET_TEXT",
    title: "Inset text",
    icon: <Info />,
    keywords: "callout, note, highlight",
    kind: "inset",
    renderPreview: ({ text }) => (
      <div className="border-l-4 border-blue-20 bg-highlight px-5 py-3 leading-[1.5]">{text}</div>
    ),
    create: () => [$createInsetNode()],
    description:
      "Sets a short note apart from the text around it, such as what happens after a choice. Keep it to a sentence or two.",
    sample: {
      text: "You only need to upload the documents that apply to your activity. Each file can be up to 10MB.",
    },
  },
  {
    id: "WARNING_TEXT",
    title: "Warning text",
    icon: <WarningCircle />,
    keywords: "callout, alert, important, caution",
    kind: "warning",
    renderPreview: ({ text }) => (
      <div className="flex items-start gap-3 border-l-4 border-yellow-80 px-5 py-3 leading-[1.5]">
        <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-yellow-80 font-bold text-ink">
          !
        </span>
        <span>{text}</span>
      </div>
    ),
    create: () => [$createWarningNode()],
    description:
      "Tells people something they must know before they go on, such as a deadline they could miss. Say what will happen and what they can do.",
    sample: {
      text: "Your event starts in fewer than 14 days. You can still apply, but we may not have time to send an officer.",
    },
  },
];
