import { ArrowsSplit, Asterisk, Eye, EyeSlash, Path, TextT, XCircle } from "@phosphor-icons/react";
import { defineContent } from "../../content";
import type { LogicActionDefinition } from "../../field";

import { nativeContent } from "../../native";

export const logicContent = defineContent({
  native: nativeContent("logic", { kind: "logic", blockType: "logic" }),
  kind: "logic",
  label: "Conditional logic",
  icon: <ArrowsSplit />,
  source: {
    storage: {
      type: "widget",
      property: "widget",
      value: "conditional-logic",
      defaultValue: "page-break",
    },
    syntax: { type: "json", name: "logic" },
  },
});

export const logicActions: readonly LogicActionDefinition[] = [
  { type: "JUMP_TO_PAGE", label: "Jump to page", icon: <Path />, order: 0 },
  { type: "REQUIRE_ANSWER", label: "Require answer", icon: <Asterisk />, order: 2 },
  { type: "SHOW_BLOCKS", label: "Show blocks", icon: <Eye />, order: 3 },
  { type: "HIDE_BLOCKS", label: "Hide blocks", icon: <EyeSlash />, order: 4 },
  { type: "CHANGE_LABEL", label: "Change question label", icon: <TextT />, order: 5 },
  { type: "CHANGE_PAGE_TITLE", label: "Change page heading", icon: <TextT />, order: 6 },
  {
    type: "HIDE_BUTTON_TO_DISABLE_COMPLETION",
    label: "Hide button to disable completion",
    icon: <XCircle />,
    order: 7,
  },
];
