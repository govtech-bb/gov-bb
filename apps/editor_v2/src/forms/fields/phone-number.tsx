import { $drawInputBox } from "../canvas/drawn-input";
import { nativeField } from "../native";
import { createElement } from "react";
import { Phone } from "@phosphor-icons/react";
import mark from "@phosphor-icons/core/assets/bold/phone-bold.svg?raw";
import { defineField } from "../field";
import type { Settings } from "../model/settings";
import { widthIssues } from "./field-setting-checks";
import { $createDrawnInput } from "../canvas/field-nodes";
import { fieldModule, type FieldInsertion } from "../canvas/field-module";
import { PhoneNumberControls } from "./phone-number-controls";

export type PhoneNumberSettings = { required: boolean; width?: string };

export const readPhoneNumberSettings = (raw: Settings): PhoneNumberSettings => ({
  required: !!raw.required,
  width: typeof raw.width === "string" ? raw.width : undefined,
});

export const phoneNumberField = defineField({
  native: nativeField("phone", { kind: "phone", valueType: "string" }),
  kind: "phone",
  label: "Phone number",
  untitled: "Unlabelled phone number",
  icon: createElement(Phone),
  gutterOffset: 11,
  source: { storage: { type: "input", property: "kind", value: "phone", defaultValue: "text" } },
  settings: { read: readPhoneNumberSettings, defaults: { required: true } },
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

export const phoneNumberInsertion: FieldInsertion = {
  id: "INPUT_PHONE_NUMBER",
  order: 7,
  keywords: "telephone",
  create: () => [$createDrawnInput("phone", phoneNumberField.defaults)],
  question: {
    description:
      "People type a phone number in any format. Barbados numbers need no country code; numbers from abroad start with +.",
    label: "Telephone number",
    hint: "For example, 246 123 4567",
  },
  answer: {
    description:
      "A phone number input with no question label. Use it under an existing label: every GovBB field needs a visible label.",
    hint: "For example, 246 123 4567",
  },
};

export const phoneNumberEntry = {
  id: phoneNumberInsertion.id,
  title: phoneNumberField.label,
  icon: phoneNumberField.icon,
  kind: phoneNumberField.kind,
  keywords: phoneNumberInsertion.keywords,
  create: phoneNumberInsertion.create,
  description: phoneNumberInsertion.answer.description,
  sample: { hint: phoneNumberInsertion.answer.hint },
};

export const PhoneNumberModule = () =>
  fieldModule({
    field: phoneNumberField,
    insertion: phoneNumberInsertion,
    Controls: PhoneNumberControls,
  });
