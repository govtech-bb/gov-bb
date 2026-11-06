import { ListBullets, ListNumbers } from "@phosphor-icons/react";
import {
  $createParagraphNode,
  COMMAND_PRIORITY_NORMAL,
  INSERT_PARAGRAPH_COMMAND,
  KEY_BACKSPACE_COMMAND,
  mergeRegister,
  type ElementNode,
  type RangeSelection,
} from "lexical";
import { $atEdge, $caretBlock, type EditorModule } from "@/editor";
import { $depth, $setDepth } from "../canvas/block-state";
import { nativeContent } from "../native";
import { contentActions, type ContentEntry } from "./content-insertion";
import { $toText } from "./content-editing";
import { defineContent } from "./define-content";
import {
  $createBulletNode,
  $createListLine,
  $createNumberNode,
  $isListLine,
  BulletNode,
  NumberNode,
} from "./list-nodes";

export const listEntries: readonly ContentEntry[] = [
  {
    id: "BULLETED_LIST",
    shortcuts: ["- ", "* "],
    title: "Bulleted list",
    icon: <ListBullets />,
    aliases: ["bullets", "unordered list", "ul"],
    markdown: "-",
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
    aliases: ["numbers", "ordered list", "steps", "ol"],
    markdown: "1.",
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

export function $enterList(
  block: ElementNode,
  _selection: RangeSelection,
  atStart: boolean,
): boolean {
  if (!$isListLine(block)) return false;

  if (block.isEmpty()) {
    block.replace($setDepth($createParagraphNode(), $depth(block))).selectStart();

    return true;
  }

  if (!atStart) return false;
  block.insertBefore(
    $setDepth($createListLine(block instanceof BulletNode ? "bullet" : "number"), $depth(block)),
  );

  return true;
}

export function $exitList(block: ElementNode): boolean {
  if (!$isListLine(block) || block.isEmpty()) return false;
  $toText(block);

  return true;
}

export function ListsModule({ browser = true, actions = true } = {}): EditorModule {
  return {
    key: "lists",
    requires: ["text"],
    provides: ["lists"],
    nodes: [
      { type: "bullet", node: BulletNode },
      { type: "number", node: NumberNode },
    ],
    actions: actions ? contentActions(listEntries) : [],
    registrations: browser
      ? [
          {
            key: "list-editing",
            phase: "browser",
            register: (editor) =>
              mergeRegister(
                editor.registerCommand(
                  INSERT_PARAGRAPH_COMMAND,
                  () => {
                    const caret = $caretBlock();

                    return (
                      !!caret &&
                      $enterList(
                        caret.block,
                        caret.selection,
                        $atEdge(caret.selection, caret.block, true),
                      )
                    );
                  },
                  COMMAND_PRIORITY_NORMAL,
                ),
                editor.registerCommand(
                  KEY_BACKSPACE_COMMAND,
                  (event) => {
                    const caret = $caretBlock();

                    if (
                      !caret ||
                      !$atEdge(caret.selection, caret.block, true) ||
                      !$exitList(caret.block)
                    )
                      return false;
                    event.preventDefault();

                    return true;
                  },
                  COMMAND_PRIORITY_NORMAL,
                ),
              ),
          },
        ]
      : [],
  };
}

export const listContents = [false, true].map((ordered) =>
  defineContent({
    kind: ordered ? "number" : "bullet",
    label: ordered ? "Numbered list" : "Bulleted list",
    turnInto: {
      kind: ordered ? "number" : "bullet",
      order: ordered ? 6 : 5,
      create: ordered ? $createNumberNode : $createBulletNode,
    },
    source: { storage: { type: ordered ? "number" : "bullet" }, syntax: { type: "list", ordered } },
    native: nativeContent(ordered ? "number" : "bullet", { kind: "list", config: { ordered } }),
  }),
);
