import {
  COMMAND_PRIORITY_NORMAL,
  FORMAT_TEXT_COMMAND,
  INSERT_LINE_BREAK_COMMAND,
  INSERT_PARAGRAPH_COMMAND,
  KEY_BACKSPACE_COMMAND,
  PASTE_COMMAND,
  mergeRegister,
} from "lexical";
import type { EditorModule } from "../../core/module";
import { $atEdge, $caretBlock } from "../formatting/editing";
import { contentActions } from "../formatting/insertion";
import { ShowHideNode } from "./nodes";
import {
  $disclosureSelection,
  $enterDisclosure,
  $exitDisclosure,
  $exitDisclosureBody,
  $pasteDisclosure,
  markDisclosures,
} from "./editing";
import { disclosureEntries } from "./insertion";

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
