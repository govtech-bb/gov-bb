import { $drawInputBox } from "../../editor/drawn-input";
import { nativeField } from "../../native";
import { createElement } from "react";
import { Clock } from "@phosphor-icons/react";
import { defineField } from "../../field";
import type { Settings } from "../../core/settings";

import { widthIssues } from "../shared/settings";
import mark from "@phosphor-icons/core/assets/bold/clock-bold.svg?raw";

import { timeIncrementError } from "../shared/increments";

export type TimeSettings = { required: boolean };

export const readTimeSettings = (raw: Settings): TimeSettings => ({ required: !!raw.required });

export const timeField = defineField({
  native: nativeField("time", { kind: "time", valueType: "time" }),
  kind: "time",
  label: "Time",
  untitled: "Unlabelled time",
  icon: createElement(Clock),
  gutterOffset: 11,
  source: { storage: { type: "input", property: "kind", value: "time", defaultValue: "text" } },
  settings: { read: readTimeSettings, defaults: { required: true } },
  capabilities: {
    hideLabel: true,
    repeat: true,
    width: "short",
    formula: true,
    comparisons: ["IS", "IS_NOT", "IS_BEFORE", "IS_AFTER", "IS_EMPTY", "IS_NOT_EMPTY"],
  },
  draw: () => $drawInputBox({ svg: mark, help: "Time" }),
  validate: (_settings, raw, where) => {
    const error = timeIncrementError(raw.step);

    return [
      ...widthIssues(raw, where),
      ...(error ? [{ code: "field-step", message: error, where }] : []),
    ];
  },
});
