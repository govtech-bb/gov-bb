import { $createDrawnInput } from "../canvas/field-nodes";
import { $drawInputBox } from "../canvas/drawn-input";
import { nativeField } from "../native";
import { createElement } from "react";
import { TextAa } from "@phosphor-icons/react";
import textAa from "@phosphor-icons/core/assets/bold/text-aa-bold.svg?raw";
import { defineField } from "../field";
import { patternWorks, maskHelp } from "../model/field-settings";
import type { Settings } from "../model/settings";
import { fieldModule, type FieldInsertion } from "../canvas/field-module";
import { TextInputControls } from "./text-input-controls";
import { answerPattern, characterLimits } from "./field-rule-settings";

export type TextInputSettings = {
  required?: boolean;
  mask?: string;
  pattern?: string;
  width?: string;
  hasMinCharacters?: boolean;
  minCharacters?: number | string;
  hasMaxCharacters?: boolean;
  maxCharacters?: number | string;
};

export const readTextInputSettings = (raw: Settings): TextInputSettings => ({
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

export const textInputField = defineField({
  native: nativeField("text", { kind: "text", valueType: "string" }),
  kind: "text",
  icon: createElement(TextAa),
  label: "Text input",
  untitled: "Unlabelled text input",
  gutterOffset: 11,
  source: { storage: { type: "input", property: "kind", value: "text", defaultValue: "text" } },
  settings: {
    read: readTextInputSettings,
    defaults: { required: true },
    own: [...characterLimits, answerPattern],
  },
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

export const textInputInsertion: FieldInsertion = {
  id: "INPUT_TEXT",
  order: 0,
  keywords: "first name, last name, short answer",
  create: () => [$createDrawnInput("text", textInputField.defaults)],
  question: {
    description:
      "People type a short answer on one line, such as a name or reference number. Use Textarea for longer answers.",
    label: "National Identification (ID) number",
    hint: "For example, 900314-0052",
  },
  answer: {
    description:
      "A text input with no question label. Use it under an existing label: every GovBB field needs a visible label.",
    hint: "For example, 900314-0052",
  },
};

export const textInputEntry = {
  id: textInputInsertion.id,
  title: textInputField.label,
  icon: textInputField.icon,
  kind: textInputField.kind,
  keywords: textInputInsertion.keywords,
  create: textInputInsertion.create,
  description: textInputInsertion.answer.description,
  sample: { hint: textInputInsertion.answer.hint },
};

export const TextInputModule = () =>
  fieldModule({
    key: "field:short-answer",
    field: textInputField,
    insertion: textInputInsertion,
    Controls: TextInputControls,
  });
