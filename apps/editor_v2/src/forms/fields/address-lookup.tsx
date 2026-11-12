import { $drawInputBox } from "../canvas/drawn-input";
import { nativeField } from "../native";
import { createElement } from "react";
import { MagnifyingGlass } from "@phosphor-icons/react";
import search from "@phosphor-icons/core/assets/bold/magnifying-glass-bold.svg?raw";
import { defineField } from "../field";
import type { Settings } from "../model/settings";
import { widthIssues, nonRepeatableIssues } from "./field-setting-checks";
import { $createDrawnInput } from "../canvas/field-nodes";
import { fieldModule, type FieldInsertion } from "../canvas/field-module";
import { AddressLookupControls } from "./address-lookup-controls";
import { characterLimits } from "./field-rule-settings";

export type AddressLookupSettings = { required: boolean; width?: string };

export const readAddressLookupSettings = (raw: Settings): AddressLookupSettings => ({
  required: !!raw.required,
  width: typeof raw.width === "string" ? raw.width : undefined,
});

export const addressLookupField = defineField({
  native: nativeField("address-lookup", { kind: "address-lookup", valueType: "string" }),
  kind: "address-lookup",
  label: "Address lookup",
  untitled: "Unlabelled address lookup",
  icon: createElement(MagnifyingGlass),
  gutterOffset: 0,
  source: {
    storage: { type: "input", property: "kind", value: "address-lookup", defaultValue: "text" },
  },
  settings: {
    read: readAddressLookupSettings,
    defaults: {
      width: "long",
      hasMinCharacters: true,
      minCharacters: 5,
      ref: "components/address-lookup",
      sourceFieldId: "address-lookup",
      sourceLabel: "Address",
      errors: {
        required: "Address is required",
        minLength: "Address must be at least 5 characters",
      },
      required: true,
    },
    own: characterLimits,
  },
  capabilities: {
    hideLabel: true,
    repeat: false,
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
  draw: () => $drawInputBox({ svg: search, help: "Address lookup" }),
  validate: (_settings, raw, where) => [
    ...widthIssues(raw, where),
    ...nonRepeatableIssues(raw, where),
  ],
});

export const addressLookupInsertion: FieldInsertion = {
  id: "ADDRESS_LOOKUP",
  order: 11,
  keywords: "address, search",
  create: () => [$createDrawnInput("address-lookup", addressLookupField.defaults)],
  question: {
    description: "People search for an address and submit one text answer.",
    label: "Address",
  },
  answer: { description: "An address search box under an existing question label." },
};

export const addressLookupEntry = {
  id: addressLookupInsertion.id,
  title: addressLookupField.label,
  icon: addressLookupField.icon,
  kind: addressLookupField.kind,
  keywords: addressLookupInsertion.keywords,
  create: addressLookupInsertion.create,
  description: addressLookupInsertion.answer.description,
};

export const AddressLookupModule = () =>
  fieldModule({
    field: addressLookupField,
    insertion: addressLookupInsertion,
    Controls: AddressLookupControls,
  });
