import {
  COMMAND_PRIORITY_NORMAL,
  INSERT_PARAGRAPH_COMMAND,
  KEY_BACKSPACE_COMMAND,
  mergeRegister,
} from "lexical";
import type { EditorModule } from "../../core/module";
import { $atEdge, $caretBlock, registerContentShortcuts } from "../formatting/editing";
import { contentActions, $insertContent } from "../formatting/insertion";
import { BulletNode, NumberNode } from "./nodes";
import { $enterList, $exitList, listShortcuts } from "./editing";
import { listEntries } from "./insertion";

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
                registerContentShortcuts(editor, listShortcuts, $insertContent),
              ),
          },
        ]
      : [],
  };
}
