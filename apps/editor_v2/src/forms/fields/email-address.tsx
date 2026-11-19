import { $createDrawnInput } from "../canvas/field-nodes";
import { $drawInputBox } from "../canvas/drawn-input";
import { nativeField } from "../native";
import { createElement } from "react";
import { At } from "@phosphor-icons/react";
import mark from "@phosphor-icons/core/assets/bold/at-bold.svg?raw";
import { defineField } from "../field";
import type { Settings } from "../model/settings";
import { widthIssues } from "./field-setting-checks";
import { fieldModule, type FieldInsertion } from "../canvas/field-module";
import { EmailAddressControls } from "./email-address-controls";

export type EmailAddressSettings = { required: boolean; width?: string };

export const readEmailAddressSettings = (raw: Settings): EmailAddressSettings => ({
  required: !!raw.required,
  width: typeof raw.width === "string" ? raw.width : undefined,
});

export const emailAddressField = defineField({
  native: nativeField("email", { kind: "email", valueType: "string" }),
  kind: "email",
  label: "Email address",
  untitled: "Unlabelled email address input",
  icon: createElement(At),
  gutterOffset: 11,
  source: { storage: { type: "input", property: "kind", value: "email", defaultValue: "text" } },
  settings: { read: readEmailAddressSettings, defaults: { required: true } },
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

export const emailAddressInsertion: FieldInsertion = {
  id: "INPUT_EMAIL",
  order: 6,
  create: () => [$createDrawnInput("email", emailAddressField.defaults)],
  question: {
    description:
      "People type an email address, which is checked for the right format. Ask for it once: GovBB doesn’t make people type it twice.",
    label: "Email address",
  },
  answer: {
    description:
      "An email address input with no question label. Use it under an existing label: every GovBB field needs a visible label.",
  },
};

export const emailAddressEntry = {
  id: emailAddressInsertion.id,
  title: emailAddressField.label,
  icon: emailAddressField.icon,
  kind: emailAddressField.kind,
  keywords: emailAddressInsertion.keywords,
  create: emailAddressInsertion.create,
  description: emailAddressInsertion.answer.description,
  sample: { hint: emailAddressInsertion.answer.hint },
};

export const EmailAddressModule = () =>
  fieldModule({
    field: emailAddressField,
    insertion: emailAddressInsertion,
    Controls: EmailAddressControls,
  });
