import { RichTextExtension } from "@lexical/rich-text";
import { $getRoot } from "lexical";
import { createElement } from "react";
import type { FormModule } from "../../field";
import { formTheme } from "../theme";
import { InputNode, OptionNode, WidgetNode } from "../answer-nodes";
import { formInsertionAction } from "../insertion-action";
import { $normalizeDepths } from "../nesting";
import {
  $ensureBlockIds,
  $ensureQuestionFields,
  $shareQuestionSettings,
  QuestionNode,
} from "../nodes";
import { registerSourceKeys } from "../source-keys";
import { validatePageNode } from "../page-settings";
import { $bindNativeAuthoring, registerNativeAuthoring } from "../native-authoring";
import { registerBehaviors } from "./index";
import { questionLabelContent, questionLabelEntry, QuestionLabelPreview } from "./insertion";

/** Form editing owns one ordered keyboard/history pipeline; feature modules own their UI. */
export function FormStructureModule(): FormModule {
  return {
    key: "form-structure",
    requires: ["text", "form-pages", "form-repetition"],
    provides: ["form", "history"],
    historyOwner: "form-structure",
    nodes: [QuestionNode, InputNode, OptionNode, WidgetNode].map((node) => ({
      type: node.getType(),
      node,
      validate: node === WidgetNode ? validatePageNode : undefined,
    })),
    storageFamilies: [
      { type: "input", property: "kind", defaultValue: "text" },
      { type: "option", property: "kind", defaultValue: "checkboxes" },
      { type: "widget", property: "widget", defaultValue: "page-break" },
    ],
    contents: [questionLabelContent],
    actions: [
      formInsertionAction(
        questionLabelEntry,
        "Layout blocks",
        3011,
        createElement(QuestionLabelPreview),
      ),
    ],
    theme: formTheme,
    browserExtensions: [RichTextExtension],
    registrations: [{ key: "form-structure", phase: "browser", register: registerBehaviors }],
    $normalizeInitial: () => $normalizeDepths($getRoot()),
  };
}

/** Runs after pages and their headings, matching the original document preparation order. */
export function FormIdentityModule(): FormModule {
  return {
    key: "form-identities",
    requires: ["form", "form-pages"],
    registrations: [
      { key: "source-keys", phase: "document", register: registerSourceKeys },
      { key: "native-authoring", phase: "document", register: registerNativeAuthoring },
    ],
    $normalizeInitial: () => {
      const root = $getRoot();
      $ensureBlockIds(root);
      $shareQuestionSettings(root);
      $ensureQuestionFields(root);
      $bindNativeAuthoring(root);
    },
  };
}
