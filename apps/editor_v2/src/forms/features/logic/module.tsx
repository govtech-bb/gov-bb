import { defineRenderer, defineSlot } from "../../../editor/react/contributions";
import type { FormModule } from "../../field";
import { formInsertionAction } from "../../editor/insertion-action";
import { AuthoringInsertionPreview } from "../../react/authoring-preview";
import { ConditionalLogic } from "./presentation";
import { LogicRuleLinks } from "./rule-links";
import { logicActions, logicContent } from "./definition";
import { conditionalLogicEntry } from "./insertion";

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
        <AuthoringInsertionPreview>
          {conditionalLogicEntry.renderPreview(conditionalLogicEntry.sample)}
        </AuthoringInsertionPreview>,
      ),
    ],
    renderers: [defineRenderer("widget:conditional-logic", ConditionalLogic)],
    slots: [defineSlot("logic-rule-links", "editor.overlay", LogicRuleLinks)],
  };
}
