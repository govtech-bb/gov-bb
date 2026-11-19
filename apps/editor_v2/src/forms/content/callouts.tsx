import { Info, WarningCircle } from "@phosphor-icons/react";
import {
  COMMAND_PRIORITY_NORMAL,
  INSERT_PARAGRAPH_COMMAND,
  KEY_BACKSPACE_COMMAND,
  mergeRegister,
  type ElementNode,
} from "lexical";
import { $atEdge, $caretBlock, type EditorModule } from "@/editor";
import { autoId } from "../model/identities";
import { nativeContent } from "../native";
import { contentActions, type ContentEntry } from "./content-insertion";
import { $paragraphBefore, $toText } from "./content-editing";
import { defineContent } from "./define-content";
import {
  $createInsetNode,
  $createWarningNode,
  $isCallout,
  InsetNode,
  WarningNode,
} from "./callout-nodes";

export const calloutEntries: readonly ContentEntry[] = [
  {
    id: "INSET_TEXT",
    title: "Inset text",
    icon: <Info />,
    aliases: ["callout", "note", "highlight"],
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
    aliases: ["alert", "important", "caution"],
    keywords: "callout",
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

export function $exitCallout(block: ElementNode): boolean {
  if (!$isCallout(block) || block.isEmpty()) return false;
  $toText(block);

  return true;
}

export function $enterCallout(block: ElementNode, atStart: boolean): boolean {
  return $isCallout(block) && !block.isEmpty() && atStart ? $paragraphBefore(block) : false;
}

export function CalloutsModule({ browser = true, actions = true } = {}): EditorModule {
  return {
    key: "callouts",
    requires: ["text"],
    provides: ["callouts"],
    nodes: [
      { type: "inset", node: InsetNode },
      { type: "warning", node: WarningNode },
    ],
    actions: actions ? contentActions(calloutEntries) : [],
    registrations: browser
      ? [
          {
            key: "callout-editing",
            phase: "browser",
            register: (editor) =>
              mergeRegister(
                editor.registerCommand(
                  INSERT_PARAGRAPH_COMMAND,
                  () => {
                    const caret = $caretBlock();

                    return (
                      !!caret &&
                      $enterCallout(caret.block, $atEdge(caret.selection, caret.block, true))
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
                      !$exitCallout(caret.block)
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

export const calloutContents = (["inset", "warning"] as const).map((kind) =>
  defineContent({
    kind,
    label: kind === "inset" ? "Inset text" : "Warning text",
    turnInto: {
      kind,
      order: kind === "inset" ? 7 : 8,
      create: kind === "inset" ? $createInsetNode : $createWarningNode,
    },
    source: { storage: { type: kind }, syntax: { type: "directive", name: kind } },
    native: nativeContent(kind, { kind: "callout", config: { tone: kind } }),
    fieldId: (text) => {
      const name = kind === "warning" ? "warning" : "note";

      return autoId(`${text.split(/\s+/).slice(0, 4).join(" ")} ${name}`, name, `${name}-`);
    },
  }),
);
