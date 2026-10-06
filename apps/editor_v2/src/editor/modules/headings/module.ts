import { HeadingNode } from "@lexical/rich-text";
import { COMMAND_PRIORITY_NORMAL, INSERT_PARAGRAPH_COMMAND, mergeRegister } from "lexical";
import type { EditorModule } from "../../core/module";
import { container, ghost } from "../../react/block-dom";
import { $atEdge, $caretBlock, registerContentShortcuts } from "../formatting/editing";
import { contentActions, $insertContent } from "../formatting/insertion";
import { $enterHeading, headingShortcuts } from "./editing";
import { headingEntries } from "./insertion";

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
                registerContentShortcuts(editor, headingShortcuts, $insertContent),
              ),
          },
        ]
      : [],
  };
}
