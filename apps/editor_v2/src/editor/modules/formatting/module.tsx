import type { EditorModule } from "../../core/module";
import { defineSlot } from "../../react/contributions";
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
    slots: [
      defineSlot("formatting-toolbar", "editor.overlay", () => <Toolbar {...resolvedPolicy} />),
    ],
  };
}
