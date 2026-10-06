import { $createDrawnInput } from "../../editor/field-nodes";
import { $drawInputBox } from "../../editor/drawn-input";
import { nativeField } from "../../native";
import { createElement } from "react";
import { At } from "@phosphor-icons/react";
import mark from "@phosphor-icons/core/assets/bold/at-bold.svg?raw";
import { defineField } from "../../field";

import type { Settings } from "../../core/settings";
import { widthIssues } from "../shared/settings";

export type EmailSettings = { required: boolean; width?: string };

export const readEmailSettings = (raw: Settings): EmailSettings => ({
  required: !!raw.required,
  width: typeof raw.width === "string" ? raw.width : undefined,
});

export const emailField = defineField({
  native: nativeField("email", { kind: "email", valueType: "string" }),
  kind: "email",
  label: "Email address",
  untitled: "Unlabelled email address input",
  icon: createElement(At),
  gutterOffset: 11,
  source: { storage: { type: "input", property: "kind", value: "email", defaultValue: "text" } },
  settings: { read: readEmailSettings, defaults: { required: true } },
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
  turnInto: { group: "written-answer", order: 2, create: () => $createDrawnInput("email") },
  draw: () => $drawInputBox({ svg: mark, help: "Email" }),
  validate: (_settings, raw, where) => widthIssues(raw, where),
});
