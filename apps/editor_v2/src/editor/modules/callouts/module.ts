import {
  COMMAND_PRIORITY_NORMAL,
  INSERT_PARAGRAPH_COMMAND,
  KEY_BACKSPACE_COMMAND,
  mergeRegister,
} from "lexical";
import type { EditorModule } from "../../core/module";
import { $atEdge, $caretBlock } from "../formatting/editing";
import { contentActions } from "../formatting/insertion";
import { InsetNode, WarningNode } from "./nodes";
import { $enterCallout, $exitCallout } from "./editing";
import { calloutEntries } from "./insertion";

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
