import { defineSlot } from "../../../editor/react/contributions";
import type { FormModule } from "../../field";
import { MentionNode } from "./node";
import { MentionMenu, MentionSettings } from "./presentation";

function MentionOverlays() {
  return (
    <>
      <MentionMenu />
      <MentionSettings />
    </>
  );
}

export function MentionsModule(): FormModule {
  return {
    key: "form-mentions",
    requires: ["form"],
    nodes: [{ type: "mention", node: MentionNode }],
    nativeCapabilities: {
      formats: ["number", "currency", "date", "choice-label", "boolean-label"],
    },
    slots: [defineSlot("form-mentions", "editor.overlay", MentionOverlays)],
  };
}
