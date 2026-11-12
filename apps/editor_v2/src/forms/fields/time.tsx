import { Clock } from "@phosphor-icons/react";
import mark from "@phosphor-icons/core/assets/bold/clock-bold.svg?raw";
import { createElement } from "react";
import type { Settings } from "../model/settings";
import { $drawInputBox } from "../canvas/drawn-input";
import { fieldModule, type FieldInsertion } from "../canvas/field-module";
import { $createDrawnInput } from "../canvas/field-nodes";
import { timeIncrementError } from "./field-increments";
import { widthIssues } from "./field-setting-checks";
import { defineField } from "../field";
import { nativeField } from "../native";
import { configSetting } from "../settings/shared-settings";
import { TimeControls } from "./time-controls";

// The Time input: a time of day, such as when an event starts

export type TimeSettings = { required: boolean };

export const readTimeSettings = (raw: Settings): TimeSettings => ({ required: !!raw.required });

/** How far the arrow keys move the time: the step setting, in seconds, kept as the native config's stepSeconds. */
const timeStep = configSetting("step", { json: "stepSeconds", number: true });

export const timeField = defineField({
  native: nativeField("time", { kind: "time", valueType: "time" }),
  kind: "time",
  label: "Time",
  untitled: "Unlabelled time",
  icon: createElement(Clock),
  gutterOffset: 11,
  source: { storage: { type: "input", property: "kind", value: "time", defaultValue: "text" } },
  settings: { read: readTimeSettings, defaults: { required: true }, own: [timeStep] },
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

export const timeInsertion: FieldInsertion = {
  id: "INPUT_TIME",
  order: 10,
  create: () => [$createDrawnInput("time", timeField.defaults)],
  question: {
    description:
      "People enter a time of day, such as when an event starts. If you need the date too, add a Date question.",
    label: "Start time",
    hint: "For example, 4:30pm",
  },
  answer: {
    description:
      "A time input with no question label. Use it under an existing label: every GovBB field needs a visible label.",
    hint: "For example, 4:30pm",
  },
};

export const TimeModule = () =>
  fieldModule({
    field: timeField,
    insertion: timeInsertion,
    Controls: TimeControls,
  });
