import { TextHOne, TextHTwo, TextHThree } from "@phosphor-icons/react";
import { $createHeadingNode } from "@lexical/rich-text";
import type { ContentEntry } from "../formatting/insertion";

export const headingEntries: readonly ContentEntry[] = [
  {
    id: "HEADING_1",
    shortcuts: ["# "],
    title: "Heading 1",
    icon: <TextHOne />,
    keywords: "h1, #",
    kind: "h1",
    renderPreview: ({ text }) => (
      <div className="leading-[1.3] font-semibold text-28">{text ?? "Heading 1"}</div>
    ),
    create: () => [$createHeadingNode("h1")],
    description:
      "The largest heading, for the title of a page. GovBB pages have one, with Heading 2 and 3 for the sections under it.",
    sample: { text: "About your business" },
  },
  {
    id: "HEADING_2",
    shortcuts: ["## "],
    title: "Heading 2",
    icon: <TextHTwo />,
    keywords: "h2, ##",
    kind: "h2",
    renderPreview: ({ text }) => (
      <div className="leading-[1.3] font-semibold text-22">{text ?? "Heading 2"}</div>
    ),
    create: () => [$createHeadingNode("h2")],
    description:
      "A heading for a section of a page, such as ‘Your contact details’. Use headings for real sections, not decoration.",
    sample: { text: "Your premises" },
  },
  {
    id: "HEADING_3",
    shortcuts: ["### "],
    title: "Heading 3",
    icon: <TextHThree />,
    keywords: "h3, ###",
    kind: "h3",
    renderPreview: ({ text }) => (
      <div className="leading-[1.3] font-semibold text-18">{text ?? "Heading 3"}</div>
    ),
    create: () => [$createHeadingNode("h3")],
    description:
      "A heading for part of a section, under a Heading 2. Keep heading levels in order, without skipping one.",
    sample: { text: "Food storage" },
  },
];
