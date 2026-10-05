import { $createDrawnInput } from "../../editor/field-nodes";
import { $drawInputBox } from "../../editor/drawn-input";
import { nativeField } from "../../native";

import { createElement } from "react";
import { TextAa } from "@phosphor-icons/react";
import textAa from "@phosphor-icons/core/assets/bold/text-aa-bold.svg?raw";

import { defineField } from "../../field";
import { patternWorks, maskHelp } from "../../core/field-settings";
import type { Settings } from "../../core/settings";

export type ShortAnswerSettings = {
  required?: boolean;
  mask?: string;
  pattern?: string;
  width?: string;
  hasMinCharacters?: boolean;
  minCharacters?: number | string;
  hasMaxCharacters?: boolean;
  maxCharacters?: number | string;
};

export const readShortAnswerSettings = (raw: Settings): ShortAnswerSettings => ({
  required: !!raw.required,
  mask: typeof raw.mask === "string" ? raw.mask : undefined,
  pattern: typeof raw.pattern === "string" ? raw.pattern : undefined,
  width: typeof raw.width === "string" ? raw.width : undefined,
  hasMinCharacters: !!raw.hasMinCharacters,
  minCharacters:
    typeof raw.minCharacters === "number" || typeof raw.minCharacters === "string"
      ? raw.minCharacters
      : undefined,
  hasMaxCharacters: !!raw.hasMaxCharacters,
  maxCharacters:
    typeof raw.maxCharacters === "number" || typeof raw.maxCharacters === "string"
      ? raw.maxCharacters
      : undefined,
});

export const shortAnswerField = defineField({
  native: nativeField("text", { kind: "text", valueType: "string" }),
  kind: "text",
  icon: createElement(TextAa),
  label: "Text input",
  untitled: "Unlabelled text input",
  gutterOffset: 11,
  source: { storage: { type: "input", property: "kind", value: "text", defaultValue: "text" } },
  settings: { read: readShortAnswerSettings, defaults: { required: true } },
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
  turnInto: { group: "written-answer", order: 0, create: () => $createDrawnInput("text") },
  draw: (settings) =>
    $drawInputBox({
      svg: textAa,
      mask: settings.mask,
      help: settings.mask ? maskHelp(settings.mask) : "Text input",
    }),
  redraw: (before, after) => before.mask !== after.mask,
  validate: (settings, raw, where) => [
    ...(settings.pattern !== undefined && !patternWorks(settings.pattern)
      ? [{ code: "pattern", message: "This format’s pattern doesn’t work", where }]
      : []),
    ...(raw.width !== undefined &&
    (typeof raw.width !== "string" || !["short", "medium", "long"].includes(raw.width))
      ? [{ code: "field-width", message: "Field width must be short, medium or long", where }]
      : []),
  ],
});
