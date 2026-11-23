import { TextHOne, TextHTwo, TextHThree } from "@phosphor-icons/react";
import { $createHeadingNode, $isHeadingNode, HeadingNode } from "@lexical/rich-text";
import {
  $createParagraphNode,
  COMMAND_PRIORITY_NORMAL,
  INSERT_PARAGRAPH_COMMAND,
  mergeRegister,
  type ElementNode,
  type RangeSelection,
} from "lexical";
import { $atEdge, $caretBlock, type EditorModule } from "@/editor";
import { container, ghost } from "@/editor/react";
import { contentActions, type ContentEntry } from "./content-insertion";
import { $paragraphBefore } from "./content-editing";
import { defineTextContent } from "./define-content";

export const headingEntries: readonly ContentEntry[] = [
  {
    id: "HEADING_1",
    shortcuts: ["# "],
    title: "Heading 1",
    icon: <TextHOne />,
    aliases: ["h1"],
    markdown: "#",
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
    aliases: ["h2", "subheading"],
    markdown: "##",
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
    aliases: ["h3"],
    markdown: "###",
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

/** A heading split continues in body text; Enter at its start opens a line above it. */
export function $enterHeading(
  block: ElementNode,
  selection: RangeSelection,
  atStart: boolean,
): boolean {
  if (!$isHeadingNode(block) || block.isEmpty()) return false;

  if (atStart) $paragraphBefore(block);
  else {
    const rest = selection.insertParagraph();

    if ($isHeadingNode(rest)) rest.replace($createParagraphNode(), true);
  }

  return true;
}

export const headingTheme = {
  h1: `${container} ${ghost} pt-8 pb-3 text-32 leading-[1.25] font-semibold tracking-[-0.015em] max-md:text-28 has-[>br:only-child]:before:content-['Heading_1']`,
  h2: `${container} ${ghost} pt-7 pb-2 text-24 leading-[1.333] font-semibold max-md:text-22 has-[>br:only-child]:before:content-['Heading_2']`,
  h3: `${container} ${ghost} pt-6 pb-2 text-20 leading-[1.4] font-semibold has-[>br:only-child]:before:content-['Heading_3']`,
};

export function HeadingsModule({ browser = true, actions = true } = {}): EditorModule {
  return {
    key: "headings",
    requires: ["text"],
    provides: ["headings"],
    nodes: [
      {
        type: "heading",
        node: HeadingNode,
        validate: (raw) =>
          ["h1", "h2", "h3", "h4", "h5", "h6"].includes(String(raw.tag))
            ? undefined
            : `Unsupported heading subtype: ${String(raw.tag)}`,
      },
    ],
    theme: { heading: headingTheme },
    actions: actions ? contentActions(headingEntries) : [],
    registrations: browser
      ? [
          {
            key: "heading-editing",
            phase: "browser",
            register: (editor) =>
              mergeRegister(
                editor.registerCommand(
                  INSERT_PARAGRAPH_COMMAND,
                  () => {
                    const caret = $caretBlock();

                    return (
                      !!caret &&
                      $enterHeading(
                        caret.block,
                        caret.selection,
                        $atEdge(caret.selection, caret.block, true),
                      )
                    );
                  },
                  COMMAND_PRIORITY_NORMAL,
                ),
              ),
          },
        ]
      : [],
  };
}

export const headingContents = ([1, 2, 3] as const).map((level) =>
  defineTextContent(
    `h${level}`,
    `Heading ${level}`,
    {
      storage: { type: "heading", property: "tag", value: `h${level}` },
      syntax: { type: "heading", level },
    },
    { kind: `h${level}`, order: 1 + level, create: () => $createHeadingNode(`h${level}`) },
  ),
);
