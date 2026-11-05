import { isTodayContext } from "../model/dates";
import type { Setting, Settings } from "../model/settings";
import type { QuestionBlock, ValidationRule } from "../formats/native/schema/types";
import { defineSetting, jsonObject, numberFromInput } from "./define-setting";

// The settings every question shares, each declared once with its native JSON (see defineSetting). A field's own
// setting with the same key replaces one of these.

/** The question's native id, which the canvas keeps as field, and the submitted key authors edit as fieldId. */
export const questionIdentity = defineSetting({
  keys: ["fieldId"],
  read: (question) => ({ field: question.id, fieldId: question.key }),
  write(draft, patch) {
    draft.question.key = typeof patch.fieldId === "string" ? patch.fieldId : "";
  },
});

/** Whether people must answer; its message stays blank until an author writes one (native-bindings.ts words it). */
export const questionRequired = defineSetting({
  keys: ["required"],
  read: (question): Settings => (question.required ? { required: question.required.value } : {}),
  write(draft, patch) {
    draft.question.required = {
      value: patch.required === true,
      message: draft.question.required?.message ?? "",
    };
  },
});

/** Whether the question is hidden: its own visibility, or its input's. */
export const questionHidden = defineSetting({
  keys: ["hidden"],
  read(question): Settings {
    if (question.parts?.input?.visible === false) return { hidden: true };

    return question.visible === undefined ? {} : { hidden: !question.visible };
  },
  write(draft, patch) {
    draft.question.visible = patch.hidden !== true;
  },
});

/** Whether people can't change the answer. */
export const questionDisabled = defineSetting({
  keys: ["isDisabled"],
  read: (question): Settings =>
    question.disabled === undefined ? {} : { isDisabled: question.disabled },
  write(draft, patch) {
    draft.question.disabled = patch.isDisabled === true;
  },
});

/** Whether the question's label is hidden from the people answering, kept as its label part's visibility. */
export const labelHidden = defineSetting({
  keys: ["hideLabel"],
  read: (question): Settings =>
    question.parts?.label?.visible === undefined
      ? {}
      : { hideLabel: !question.parts.label.visible },
  write(draft, patch) {
    const { question } = draft;

    question.parts = {
      ...question.parts,
      label: { ...question.parts?.label, visible: patch.hideLabel !== true },
    };
  },
});

/**
 * An answer filled in for people, kept as the question's default in the form its answer type takes: a date input's
 * "today" is { context: "today" }, a number is a number and yes or no is never left unset.
 */
export const defaultAnswer = defineSetting({
  keys: ["hasDefaultAnswer", "defaultAnswer"],
  read: (question): Settings =>
    question.default === undefined
      ? {}
      : {
          hasDefaultAnswer: true,
          defaultAnswer: isTodayContext(question.default)
            ? { field: "utility::today()" }
            : question.default,
        },
  write(draft, _patch, merged) {
    const { question, valueType } = draft;

    if (merged.hasDefaultAnswer && merged.defaultAnswer !== undefined)
      // oxlint-disable-next-line anti-slop/require-safety-comment-for-type-assertion -- An unfinished default must remain editable even when incompatible with its question kind; native export validates the default.
      question.default = (
        valueType === "date" && jsonObject(merged.defaultAnswer).field === "utility::today()"
          ? { context: "today" }
          : valueType === "number"
            ? numberFromInput(merged.defaultAnswer)
            : valueType === "boolean"
              ? (merged.defaultAnswer ?? false)
              : merged.defaultAnswer
      ) as QuestionBlock["default"];
    else delete question.default;
  },
});

/** People may answer more than once, kept as the question's repeat: at least min, at most max, and its add label. */
export const answerRepeat = defineSetting({
  keys: ["fieldArray"],
  read: (question): Settings =>
    question.repeat
      ? {
          fieldArray: {
            min: question.repeat.min,
            ...(question.repeat.max !== undefined && { max: question.repeat.max }),
            addAnotherLabel: question.repeat.addLabel,
          },
        }
      : {},
  write(draft, patch) {
    const repeat = jsonObject(patch.fieldArray);

    if (patch.fieldArray === undefined) delete draft.question.repeat;
    else
      draft.question.repeat = {
        // oxlint-disable-next-line anti-slop/require-safety-comment-for-type-assertion -- Repeat bounds may be incomplete while editing; validateFormDefinition checks the stored values on export.
        min: repeat.min as number,
        // oxlint-disable-next-line anti-slop/require-safety-comment-for-type-assertion -- Repeat bounds may be incomplete while editing; validateFormDefinition checks the stored values on export.
        ...(repeat.max !== undefined && { max: repeat.max as number }),
        addLabel:
          typeof repeat.addAnotherLabel === "string"
            ? repeat.addAnotherLabel
            : "Add another answer",
      };
  },
});

/**
 * A setting kept in the question's native config, under its own name or another (json), such as the Time input's
 * step, kept as stepSeconds; a number one turns typed text into a number.
 */
export function configSetting(key: string, { json = key, number = false } = {}) {
  return defineSetting({
    keys: [key],
    read(question): Settings {
      const config = jsonObject(question.config);

      // oxlint-disable-next-line anti-slop/require-safety-comment-for-type-assertion -- The settings panel projects opaque configuration without discarding malformed draft values; native export validates them.
      return Object.hasOwn(config, json) ? { [key]: config[json] as Setting } : {};
    },
    write(draft, patch) {
      const config = { ...jsonObject(draft.question.config) };

      if (patch[key] === undefined) delete config[json];
      else config[json] = number ? numberFromInput(patch[key]) : patch[key];

      if (Object.keys(config).length) draft.question.config = config;
      else delete draft.question.config;
    },
  });
}

/** How wide the answer box is: short, medium or long. */
export const answerWidth = configSetting("width");

/** Example text in an empty answer box. */
export const answerPlaceholder = configSetting("placeholder");

/** A pattern the answer box formats typing into. */
export const answerMask = configSetting("mask");

// Older messages were kept under these names, for the rules that had them
const messageAliases: Partial<Record<ValidationRule["type"], string>> = {
  minimum: "min",
  maximum: "max",
  minSelections: "minSelection",
  maxSelections: "maxSelection",
};

/** The messages authors wrote for the required answer and for each rule, by rule type; a blank one is no message. */
export const errorMessages = defineSetting({
  keys: ["errors"],
  read(question): Settings {
    const errors: Settings = {};

    if (question.required?.message.trim()) errors.required = question.required.message;

    for (const rule of question.validation ?? []) {
      if (rule.message.trim()) errors[rule.type] = rule.message;
    }

    return Object.keys(errors).length ? { errors } : {};
  },
  write(draft, patch) {
    const errors = jsonObject(patch.errors);

    if (draft.question.required && typeof errors.required === "string")
      draft.question.required.message = errors.required;

    for (const rule of draft.validation) {
      const message = errors[rule.type] ?? errors[messageAliases[rule.type] ?? ""];

      if (typeof message === "string") rule.message = message;
    }
  },
});
