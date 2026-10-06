import { $createLongAnswerInput } from "../../editor/field-nodes";
import { $drawLongAnswer } from "./presentation";
import { nativeField } from "../../native";
import { createElement } from "react";
import { TextAlignLeft } from "@phosphor-icons/react";
import { defineField } from "../../field";

import { widthIssues } from "../shared/settings";
import type { Settings } from "../../core/settings";

export type LongAnswerSettings = { required: boolean; width?: string };

export const readLongAnswerSettings = (raw: Settings): LongAnswerSettings => ({
  required: !!raw.required,
  width: typeof raw.width === "string" ? raw.width : undefined,
});

export const longAnswerField = defineField({
  native: nativeField("long-answer", { kind: "long-text", valueType: "string" }),
  kind: "long-answer",
  label: "Textarea",
  untitled: "Unlabelled textarea",
  icon: createElement(TextAlignLeft),
  gutterOffset: 10,
  source: { storage: { type: "long-answer" } },
  settings: { read: readLongAnswerSettings, defaults: { required: true } },
  capabilities: {
    hideLabel: true,
    repeat: true,
    width: "long",
    formula: true,
    comparisons: [
      "IS",
      "IS_NOT",
      "CONTAINS",
      "DOES_NOT_CONTAIN",
      "STARTS_WITH",
      "DOES_NOT_START_WITH",
      "ENDS_WITH",
      "DOES_NOT_END_WITH",
      "IS_EMPTY",
      "IS_NOT_EMPTY",
    ],
  },
  turnInto: { group: "written-answer", order: 1, create: () => $createLongAnswerInput() },
  draw: $drawLongAnswer,
  validate: (_settings, raw, where) => widthIssues(raw, where),
});
