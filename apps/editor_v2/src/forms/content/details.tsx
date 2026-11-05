import { CaretCircleRight } from "@phosphor-icons/react";
import {
  $createParagraphNode,
  $getRoot,
  $getSelection,
  $isParagraphNode,
  $isRangeSelection,
  COMMAND_PRIORITY_NORMAL,
  FORMAT_TEXT_COMMAND,
  INSERT_LINE_BREAK_COMMAND,
  INSERT_PARAGRAPH_COMMAND,
  KEY_BACKSPACE_COMMAND,
  PASTE_COMMAND,
  mergeRegister,
  type ElementNode,
  type LexicalEditor,
  type RangeSelection,
} from "lexical";
import { $atEdge, $caretBlock, type EditorModule } from "@/editor";
import { autoId } from "../model/identities";
import { $depth, $setDepth, $settings } from "../canvas/block-state";
import { nativeContent } from "../native";
import { contentActions, type ContentEntry } from "./content-insertion";
import { $paragraphBefore, $toText } from "./content-editing";
import { defineContent } from "./define-content";
import { $createShowHideNode, $isShowHideNode, ShowHideNode } from "./details-node";

// Details is a show/hide: its summary line, and the deeper blocks after it that it reveals

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

export function $enterDisclosure(block: ElementNode, atStart: boolean): boolean {
  return $isShowHideNode(block) && !block.isEmpty() && atStart ? $paragraphBefore(block) : false;
}

export function $exitDisclosure(block: ElementNode): boolean {
  if (!$isShowHideNode(block) || block.isEmpty()) return false;
  $toText(block);

  return true;
}

export function $disclosureSelection() {
  const selection = $getSelection();

  const block = $isRangeSelection(selection)
    ? selection.anchor.getNode().getTopLevelElement()
    : null;

  return $isRangeSelection(selection) && $isShowHideNode(block) ? { selection, block } : null;
}

export function $pasteDisclosure(
  selection: RangeSelection,
  block: ElementNode,
  text: string,
): boolean {
  if (!$isShowHideNode(block)) return false;
  selection.insertText(
    text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .join(" "),
  );

  return true;
}

/** Empty text at the end of a disclosure exits one level, retaining its root-block representation. */
export function $exitDisclosureBody(block: ElementNode): boolean {
  if (!$isParagraphNode(block) || !block.isEmpty() || !$depth(block)) return false;
  const next = block.getNextSibling();

  if (next && $depth(next) >= $depth(block)) return false;
  $setDepth(block, $depth(block) - 1);
  block.selectStart();

  return true;
}

/** Content-only nesting display; forms keep their richer nesting projection in their own adapter. */
export function markDisclosures(editor: LexicalEditor) {
  return editor.registerUpdateListener(({ editorState }) =>
    editorState.read(
      () => {
        const hosts: ShowHideNode[] = [];

        for (const block of $getRoot().getChildren()) {
          while (hosts.length && $depth(hosts.at(-1)!) >= $depth(block)) hosts.pop();
          const dom = editor.getElementByKey(block.getKey());

          if (dom) {
            dom.hidden = hosts.some((host) => !!$settings(host).folded);
            dom.toggleAttribute("data-nested", hosts.length > 0);

            if (hosts.length) dom.style.setProperty("--nest", `${hosts.length * 28}px`);
            else dom.style.removeProperty("--nest");
          }

          if ($isShowHideNode(block)) hosts.push(block);
        }
      },
      { editor },
    ),
  );
}

export function DisclosureModule({ browser = true, actions = true } = {}): EditorModule {
  return {
    key: "disclosure",
    requires: ["text"],
    provides: ["disclosure"],
    nodes: [{ type: "show-hide", node: ShowHideNode }],
    actions: actions ? contentActions(disclosureEntries) : [],
    registrations: browser
      ? [
          {
            key: "disclosure-editing",
            phase: "browser",
            register: (editor) =>
              mergeRegister(
                editor.registerCommand(
                  KEY_BACKSPACE_COMMAND,
                  (event) => {
                    const caret = $caretBlock();

                    if (
                      !caret ||
                      !$atEdge(caret.selection, caret.block, true) ||
                      !$exitDisclosure(caret.block)
                    )
                      return false;
                    event.preventDefault();

                    return true;
                  },
                  COMMAND_PRIORITY_NORMAL,
                ),
                editor.registerCommand(
                  INSERT_PARAGRAPH_COMMAND,
                  () => {
                    const caret = $caretBlock();

                    return (
                      !!caret &&
                      ($exitDisclosureBody(caret.block) ||
                        $enterDisclosure(caret.block, $atEdge(caret.selection, caret.block, true)))
                    );
                  },
                  COMMAND_PRIORITY_NORMAL,
                ),
                editor.registerCommand(
                  INSERT_LINE_BREAK_COMMAND,
                  () => !!$disclosureSelection(),
                  COMMAND_PRIORITY_NORMAL,
                ),
                editor.registerCommand(
                  FORMAT_TEXT_COMMAND,
                  () => !!$disclosureSelection(),
                  COMMAND_PRIORITY_NORMAL,
                ),
                editor.registerCommand(
                  PASTE_COMMAND,
                  (event) => {
                    const target = $disclosureSelection();

                    const text =
                      event instanceof ClipboardEvent
                        ? event.clipboardData?.getData("text/plain")
                        : undefined;

                    if (!target || !text) return false;
                    event.preventDefault();

                    return $pasteDisclosure(target.selection, target.block, text);
                  },
                  COMMAND_PRIORITY_NORMAL,
                ),
                markDisclosures(editor),
              ),
          },
        ]
      : [],
  };
}

export const disclosureContent = defineContent({
  kind: "show-hide",
  label: "Details",
  turnInto: { kind: "show-hide", order: 9, create: $createShowHideNode },
  source: {
    storage: { type: "show-hide" },
    syntax: { type: "directive", name: "show-hide", nested: true },
  },
  native: nativeContent("show-hide", { kind: "expandable" }),
  fieldId: (text) => autoId(text, "show-hide", "show-hide-"),
});
