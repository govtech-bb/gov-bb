import { ListBullets, ListNumbers } from "@phosphor-icons/react";
import { $createBulletNode, $createNumberNode } from "./nodes";
import type { ContentEntry } from "../formatting/insertion";

export const listEntries: readonly ContentEntry[] = [
  {
    id: "BULLETED_LIST",
    shortcuts: ["- ", "* "],
    title: "Bulleted list",
    icon: <ListBullets />,
    keywords: "bullets, unordered, ul, -",
    kind: "bullet",
    renderPreview: ({ text, items = [] }) => (
      <>
        {text && <p className="leading-[1.5]">{text}</p>}
        <ul className="mt-2 flex flex-col gap-2 pl-6 leading-[1.5] list-disc">
          {items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </>
    ),
    create: () => [$createBulletNode()],
    description:
      "Things in no particular order, such as the documents to bring. Introduce the list with a line ending in a colon, start each item with a lowercase letter and leave off the full stop.",
    sample: {
      text: "You will need:",
      items: ["your National ID card", "a recent utility bill", "two passport photos"],
    },
  },
  {
    id: "NUMBERED_LIST",
    shortcuts: ["1. "],
    title: "Numbered list",
    icon: <ListNumbers />,
    keywords: "numbers, ordered, steps, ol, 1.",
    kind: "number",
    renderPreview: ({ text, items = [] }) => (
      <>
        {text && <p className="leading-[1.5]">{text}</p>}
        <ol className="mt-2 flex flex-col gap-2 pl-6 leading-[1.5] list-decimal">
          {items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ol>
      </>
    ),
    create: () => [$createNumberNode()],
    description:
      "Steps people take in order, such as what happens after they apply. The list needs no lead-in, and each step is a full sentence ending in a full stop.",
    sample: {
      items: [
        "Fill in the application form.",
        "Pay the fee.",
        "Collect your licence from the Barbados Licensing Authority.",
      ],
    },
  },
];
