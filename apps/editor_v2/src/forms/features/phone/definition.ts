import { $drawInputBox } from "../../editor/drawn-input";
import { nativeField } from "../../native";
import { createElement } from "react";
import { Phone } from "@phosphor-icons/react";
import mark from "@phosphor-icons/core/assets/bold/phone-bold.svg?raw";
import { defineField } from "../../field";

import type { Settings } from "../../core/settings";
import { widthIssues } from "../shared/settings";

export type PhoneSettings = { required: boolean; width?: string };

export const readPhoneSettings = (raw: Settings): PhoneSettings => ({
  required: !!raw.required,
  width: typeof raw.width === "string" ? raw.width : undefined,
});

export const phoneField = defineField({
  native: nativeField("phone", { kind: "phone", valueType: "string" }),
  kind: "phone",
  label: "Phone number",
  untitled: "Unlabelled phone number",
  icon: createElement(Phone),
  gutterOffset: 11,
  source: { storage: { type: "input", property: "kind", value: "phone", defaultValue: "text" } },
  settings: { read: readPhoneSettings, defaults: { required: true } },
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
  draw: () => $drawInputBox({ svg: mark, help: "Phone number" }),
  validate: (_settings, raw, where) => widthIssues(raw, where),
});
