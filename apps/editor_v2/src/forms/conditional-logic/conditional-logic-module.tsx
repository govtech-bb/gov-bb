import { defineRenderer, defineSlot } from "@/editor/react";
import type { FormModule } from "../field";
import { formInsertionAction } from "../canvas/insertion-action";
import { ConditionalLogic } from "./logic-presentation";
import { LogicRuleLinks } from "./logic-rule-links";
import { logicActions, logicContent } from "./logic-definition";
import { conditionalLogicEntry } from "./logic-insertion";

export function ConditionalLogicModule(): FormModule {
  return {
    key: "form-logic",
    requires: ["form"],
    contents: [logicContent],
    logicActions,
    nativeCapabilities: {
      actions: [
        "setVisible",
        "setRequired",
        "setLabel",
        "setTitle",
        "error",
        "goTo",
        "setCompletionEnabled",
      ],
      operators: [
        "all",
        "any",
        "not",
        "eq",
        "ne",
        "gt",
        "gte",
        "lt",
        "lte",
        "contains",
        "startsWith",
        "endsWith",
        "empty",
        "selected",
      ],
    },
    actions: [
      formInsertionAction(
        conditionalLogicEntry,
        "Advanced blocks",
        4000,
        conditionalLogicEntry.renderPreview(conditionalLogicEntry.sample),
      ),
    ],
    renderers: [defineRenderer("widget:conditional-logic", ConditionalLogic)],
    slots: [defineSlot("logic-rule-links", "editor.overlay", LogicRuleLinks)],
  };
}
