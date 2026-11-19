import type { EditorModule } from "../../core/module";
import { defineSlot } from "../../react/contributions";
import { registerTurnIntoKeys } from "../../react/turn-into";
import { registerMarkdownShortcuts } from "./markdown-shortcuts";
import { TextLinkAtCaret } from "./link-at-caret";
import { Toolbar, type ToolbarPolicy } from "./toolbar";

export const textFormatTheme = {
  bold: "font-bold",
  italic: "italic",
  strikethrough: "line-through",
};

export function FormattingModule(policy: ToolbarPolicy = {}): EditorModule {
  const resolvedPolicy = { ...policy };

  return {
    key: "formatting",
    requires: ["text", ...(policy.linksEnabled === false ? [] : ["links"])],
    provides: ["formatting"],
    theme: { text: textFormatTheme },
    registrations: [
      { key: "turn-into-keys", phase: "browser", register: registerTurnIntoKeys },
      {
        key: "markdown-shortcuts",
        phase: "browser",
        register: (editor) => registerMarkdownShortcuts(editor, resolvedPolicy),
      },
    ],
    slots: [
      defineSlot("formatting-toolbar", "editor.overlay", () => <Toolbar {...resolvedPolicy} />),
      ...(policy.linksEnabled === false
        ? []
        : [
            defineSlot("link-at-caret", "editor.overlay", () => (
              <TextLinkAtCaret {...resolvedPolicy} />
            )),
          ]),
    ],
  };
}
