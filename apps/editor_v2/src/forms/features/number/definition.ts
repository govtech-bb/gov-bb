import { $drawNumber } from "./presentation";
import { nativeField } from "../../native";
import { createElement } from "react";
import { Hash } from "@phosphor-icons/react";
import { defineField } from "../../field";
import type { Settings } from "../../core/settings";

import { widthIssues } from "../shared/settings";

import { positiveIncrementError } from "../shared/increments";

export type NumberSettings = { required: boolean };

export const readNumberSettings = (raw: Settings): NumberSettings => ({ required: !!raw.required });

export const numberField = defineField({
  native: nativeField("number", { kind: "number", valueType: "number" }),
  kind: "number",
  label: "Number",
  untitled: "Unlabelled number",
  icon: createElement(Hash),
  gutterOffset: 11,
  source: { storage: { type: "input", property: "kind", value: "number", defaultValue: "text" } },
  settings: { read: readNumberSettings, defaults: { required: true } },
  capabilities: {
    hideLabel: true,
    repeat: true,
    width: "long",
    formula: true,
    comparisons: [
      "EQUAL",
      "NOT_EQUAL",
      "GREATER_THAN",
      "LESS_THAN",
      "GREATER_OR_EQUAL_THAN",
      "LESS_OR_EQUAL_THAN",
      "IS_EMPTY",
      "IS_NOT_EMPTY",
    ],
  },
  draw: $drawNumber,
  validate: (_settings, raw, where) => {
    const error = positiveIncrementError(raw.step);

    return [
      ...widthIssues(raw, where),
      ...(error ? [{ code: "field-step", message: error, where }] : []),
    ];
  },
});
