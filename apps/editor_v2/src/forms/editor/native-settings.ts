import { $getRoot, $setState, type LexicalNode } from "lexical";
import {
  $setSettings as $setLegacySettings,
  $settings,
  settingsState,
} from "../../editor/core/document-state";
import type { Settings, Setting } from "../core/settings";
import type { QuestionBlock, ValidationRule } from "../schema/types";
import { $native, $setNative, type NativeNodeData } from "./native-state";

type QuestionData = NonNullable<NativeNodeData["question"]>;

const limits = [
  ["hasMinCharacters", "minCharacters", "minLength"],
  ["hasMaxCharacters", "maxCharacters", "maxLength"],
  ["hasMinNumber", "minNumber", "minimum"],
  ["hasMaxNumber", "maxNumber", "maximum"],
  ["hasMinChoices", "minChoices", "minSelections"],
  ["hasMaxChoices", "maxChoices", "maxSelections"],
  ["hasMinAge", "minAge", "minAge"],
  ["hasMaxAge", "maxAge", "maxAge"],
  ["hasMinFiles", "minFiles", "minFiles"],
  ["hasMaxFiles", "maxFiles", "maxFiles"],
  ["hasMaxFileSize", "maxFileSize", "maxFileSize"],
] as const;

// SAFETY: The condition checks a non-null non-array object; every property remains unknown.
const object = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

const inputNumber = (value: unknown): unknown =>
  typeof value === "string" && value.trim() && Number.isFinite(Number(value))
    ? Number(value)
    : value;

const isToday = (value: unknown) => object(value).context === "today";

/** Presentation settings are projected from native state; edits write back through $setFormSettings. */
export function nativeQuestionSettings(question: QuestionData): Settings {
  const settings: Settings = { field: question.id, fieldId: question.key };

  if (question.required) settings.required = question.required.value;

  if (question.visible !== undefined) settings.hidden = !question.visible;

  if (question.parts?.input?.visible === false) settings.hidden = true;

  if (question.disabled !== undefined) settings.isDisabled = question.disabled;

  if (question.parts?.label?.visible !== undefined)
    settings.hideLabel = !question.parts.label.visible;

  if (question.default !== undefined) {
    settings.hasDefaultAnswer = true;
    settings.defaultAnswer = isToday(question.default)
      ? { field: "utility::today()" }
      : question.default;
  }

  if (question.repeat)
    settings.fieldArray = {
      min: question.repeat.min,
      ...(question.repeat.max !== undefined && { max: question.repeat.max }),
      addAnotherLabel: question.repeat.addLabel,
    };

  if (question.config)
    for (const key of ["width", "placeholder", "mask", "step"])
      if (Object.hasOwn(question.config, key))
        // oxlint-disable-next-line anti-slop/require-safety-comment-for-type-assertion -- The settings panel projects opaque configuration without discarding malformed draft values; native export validates them.
        settings[key] = object(question.config)[key] as Setting;

  if (object(question.config).stepSeconds !== undefined)
    // oxlint-disable-next-line anti-slop/require-safety-comment-for-type-assertion -- The settings panel retains a draft time step as authored; native export validates the numeric configuration.
    settings.step = object(question.config).stepSeconds as number;

  if (object(question.config).multiple !== undefined)
    // oxlint-disable-next-line anti-slop/require-safety-comment-for-type-assertion -- The settings panel retains the draft file-selection flag; native export validates its boolean contract.
    settings.hasMultipleFiles = object(question.config).multiple as boolean;
  const errors: Settings = {};

  if (question.required) errors.required = question.required.message;

  for (const rule of question.validation ?? []) {
    errors[rule.type] = rule.message;
    const limit = limits.find(([, , type]) => type === rule.type);

    if (limit && "value" in rule) {
      settings[limit[0]] = true;
      settings[limit[1]] = rule.value;
    }

    if (rule.type === "pattern") settings.pattern = rule.pattern;

    if (rule.type === "dateBefore" || rule.type === "dateAfter") {
      if (isToday(rule.value))
        settings.relativeDate =
          rule.type === "dateBefore"
            ? rule.inclusive
              ? "pastOrToday"
              : "past"
            : rule.inclusive
              ? "futureOrToday"
              : "future";
      else if (typeof rule.value === "string")
        settings[rule.type === "dateBefore" ? "beforeDate" : "afterDate"] = rule.value;
    }

    if (rule.type === "dateIn") settings.specificDates = rule.value;

    if (rule.type === "fileTypes") settings.allowedFiles = rule.value;
  }

  const after = question.validation?.find(
    (rule) => rule.type === "dateAfter" && typeof rule.value === "string",
  );

  const before = question.validation?.find(
    (rule) => rule.type === "dateBefore" && typeof rule.value === "string",
  );

  if (
    after &&
    before &&
    "value" in after &&
    "value" in before &&
    typeof after.value === "string" &&
    typeof before.value === "string" &&
    "inclusive" in after &&
    after.inclusive &&
    "inclusive" in before &&
    before.inclusive
  ) {
    settings.dateRange = { from: after.value, to: before.value };
    delete settings.beforeDate;
    delete settings.afterDate;
  }

  if (Object.keys(errors).length) settings.errors = errors;

  for (const key of Object.keys(settings)) if (settings[key] === undefined) delete settings[key];

  return settings;
}

export function applyNativeQuestionSettings(
  question: QuestionData,
  patch: Partial<Record<string, Setting | undefined>>,
  merged: Settings,
): QuestionData {
  const next = structuredClone(question);

  if ("required" in patch)
    next.required = {
      value: patch.required === true,
      message: question.required?.message ?? "Enter an answer",
    };

  if ("isDisabled" in patch) next.disabled = patch.isDisabled === true;

  if ("hidden" in patch) next.visible = patch.hidden !== true;

  if ("hideLabel" in patch)
    next.parts = {
      ...next.parts,
      label: { ...next.parts?.label, visible: patch.hideLabel !== true },
    };

  if ("fieldId" in patch) next.key = typeof patch.fieldId === "string" ? patch.fieldId : "";

  if ("hasDefaultAnswer" in patch || "defaultAnswer" in patch) {
    if (merged.hasDefaultAnswer && merged.defaultAnswer !== undefined)
      // oxlint-disable-next-line anti-slop/require-safety-comment-for-type-assertion -- An unfinished default must remain editable even when incompatible with its question kind; native export validates the default.
      next.default = (
        next.kind === "date" && object(merged.defaultAnswer).field === "utility::today()"
          ? { context: "today" }
          : next.kind === "number"
            ? inputNumber(merged.defaultAnswer)
            : next.kind === "boolean"
              ? (merged.defaultAnswer ?? false)
              : merged.defaultAnswer
      ) as QuestionBlock["default"];
    else delete next.default;
  }

  const config = { ...object(next.config) };

  for (const key of ["width", "placeholder", "mask", "step"])
    if (key in patch) {
      const nativeKey = key === "step" && next.kind === "time" ? "stepSeconds" : key;

      if (patch[key] === undefined) delete config[nativeKey];
      else config[nativeKey] = key === "step" ? inputNumber(patch[key]) : patch[key];
    }

  if ("hasMultipleFiles" in patch) config.multiple = patch.hasMultipleFiles === true;

  if (Object.keys(config).length) next.config = config;
  else if (["width", "placeholder", "mask", "step", "hasMultipleFiles"].some((key) => key in patch))
    delete next.config;
  const validation = [...(next.validation ?? [])];

  const replace = (type: ValidationRule["type"], value?: Record<string, unknown>) => {
    const index = validation.findIndex((rule) => rule.type === type);
    const previous = index < 0 ? undefined : validation[index];

    if (value === undefined) {
      if (index >= 0) validation.splice(index, 1);

      return;
    }

    // oxlint-disable-next-line anti-slop/require-safety-comment-for-type-assertion -- Validation rows are assembled while inputs may be incomplete; validateFormDefinition checks each final rule contract at export.
    const rule = {
      ...previous,
      id: previous?.id ?? `${next.id}-${type}`,
      type,
      message: previous?.message ?? "Enter a valid answer",
      ...value,
    } as ValidationRule;

    if (index < 0) validation.push(rule);
    else validation[index] = rule;
  };

  for (const [toggle, key, type] of limits)
    if (toggle in patch || key in patch)
      replace(
        type,
        merged[toggle]
          ? { value: inputNumber(merged[key]), ...(type === "maxFileSize" && { unit: "MB" }) }
          : undefined,
      );

  if ("pattern" in patch)
    replace(
      "pattern",
      merged.pattern
        ? {
            pattern: merged.pattern,
            flags: validation.find((rule) => rule.type === "pattern")?.flags ?? "u",
          }
        : undefined,
    );

  const dateRule = (
    type: "dateBefore" | "dateAfter",
    today: boolean,
    value?: Record<string, unknown>,
  ) => {
    const index = validation.findIndex(
      (rule) => rule.type === type && isToday(rule.value) === today,
    );

    const previous = index < 0 ? undefined : validation[index];

    if (!value) {
      if (index >= 0) validation.splice(index, 1);

      return;
    }

    // oxlint-disable-next-line anti-slop/require-safety-comment-for-type-assertion -- Date-validation rows are assembled while inputs may be incomplete; validateFormDefinition checks each final rule contract at export.
    const nextRule = {
      ...previous,
      id: previous?.id ?? `${next.id}-${type}${today ? "-today" : ""}`,
      message: previous?.message ?? "Enter a date in the permitted range",
      type,
      ...value,
    } as ValidationRule;

    if (index < 0) validation.push(nextRule);
    else validation[index] = nextRule;
  };

  for (const [key, type] of [
    ["beforeDate", "dateBefore"],
    ["afterDate", "dateAfter"],
  ] as const)
    if (key in patch)
      dateRule(type, false, merged[key] ? { value: merged[key], inclusive: false } : undefined);

  if ("relativeDate" in patch) {
    const relative = merged.relativeDate;

    for (const type of ["dateBefore", "dateAfter"] as const)
      dateRule(
        type,
        true,
        (
          type === "dateBefore"
            ? relative === "past" || relative === "pastOrToday"
            : relative === "future" || relative === "futureOrToday"
        )
          ? {
              value: { context: "today" },
              inclusive: relative === "pastOrToday" || relative === "futureOrToday",
            }
          : undefined,
      );
  }

  if ("dateRange" in patch && merged.dateRange) {
    const range = object(merged.dateRange);
    dateRule(
      "dateAfter",
      false,
      typeof range.from === "string" ? { value: range.from, inclusive: true } : undefined,
    );
    dateRule(
      "dateBefore",
      false,
      typeof range.to === "string" ? { value: range.to, inclusive: true } : undefined,
    );
  }

  if ("specificDates" in patch)
    replace(
      "dateIn",
      Array.isArray(merged.specificDates) && merged.specificDates.length
        ? { value: merged.specificDates }
        : undefined,
    );

  if ("allowedFiles" in patch)
    replace(
      "fileTypes",
      Array.isArray(merged.allowedFiles) && merged.allowedFiles.length
        ? { value: merged.allowedFiles }
        : undefined,
    );

  if ("errors" in patch) {
    const errors = object(patch.errors);

    if (next.required && typeof errors.required === "string")
      next.required.message = errors.required;

    const aliases: Partial<Record<ValidationRule["type"], string>> = {
      minimum: "min",
      maximum: "max",
      minSelections: "minSelection",
      maxSelections: "maxSelection",
    };

    for (const rule of validation) {
      const message = errors[rule.type] ?? errors[aliases[rule.type] ?? ""];

      if (typeof message === "string") rule.message = message;
    }
  }

  if ("fieldArray" in patch) {
    const repeat = object(patch.fieldArray);

    if (patch.fieldArray === undefined) delete next.repeat;
    else
      next.repeat = {
        // oxlint-disable-next-line anti-slop/require-safety-comment-for-type-assertion -- Repeat bounds may be incomplete while editing; validateFormDefinition checks the stored values on export.
        min: repeat.min as number,
        // oxlint-disable-next-line anti-slop/require-safety-comment-for-type-assertion -- Repeat bounds may be incomplete while editing; validateFormDefinition checks the stored values on export.
        ...(repeat.max !== undefined && { max: repeat.max as number }),
        addLabel:
          typeof repeat.addAnotherLabel === "string"
            ? repeat.addAnotherLabel
            : "Add another answer",
      };
  }

  if (validation.length || next.validation) next.validation = validation;

  return next;
}

/** All form-owned controls use this adapter; generic editor settings keep their original behavior. */
export function $setFormSettings<T extends LexicalNode>(
  node: T,
  patch: Partial<Record<string, Setting | undefined>>,
): T {
  const native = $native(node);

  if (!Object.keys(native).length) return $setLegacySettings(node, patch);
  const merged = { ...$settings(node) };

  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) delete merged[key];
    else merged[key] = value;
  }

  if (native.question) {
    const questionPatch = { ...patch };

    if (native.option) delete questionPatch.hidden;
    $setNative(node, {
      question: applyNativeQuestionSettings(native.question, questionPatch, merged),
    });
  }

  if (
    !native.question &&
    "hidden" in patch &&
    (native.part === "label" || native.part === "hint" || native.hintOwner)
  ) {
    const owner = native.hintOwner ?? native.owner,
      part = native.part === "label" ? "label" : "hint";

    for (const member of $getRoot().getChildren()) {
      const question = $native(member).question;

      if (question && question.id === owner) {
        $setNative(member, {
          question: {
            ...question,
            parts: { ...question.parts, [part]: { visible: patch.hidden !== true } },
          },
        });

        // Source reload compares this editable projection with the native label visibility.
        if (part === "label") $setLegacySettings(member, { hideLabel: patch.hidden === true });
      }
    }
  }

  if (native.option && "optionValue" in patch)
    $setNative(node, {
      // oxlint-disable-next-line anti-slop/require-safety-comment-for-type-assertion -- Keep an authored option value even if invalid for this question; native export reports the scalar-type error.
      option: { ...native.option, value: patch.optionValue as string | number | boolean },
    });

  if (native.option && "hidden" in patch)
    $setNative(node, { option: { ...$native(node).option!, visible: patch.hidden !== true } });

  if (native.options && "nativeOptions" in patch)
    // oxlint-disable-next-line anti-slop/require-safety-comment-for-type-assertion -- Keep edited native option rows until native export validates their IDs, labels and values.
    $setNative(node, { options: patch.nativeOptions as NativeNodeData["options"] });

  if (native.question && "nativeGroups" in patch)
    $setNative(node, {
      question: {
        ...$native(node).question!,
        config: { ...object($native(node).question?.config), groups: patch.nativeGroups },
      },
    });

  if (native.page) {
    const page = { ...native.page };

    if ("confirmation" in patch || "pageType" in patch)
      page.role = merged.confirmation
        ? "confirmation"
        : merged.pageType === "check-answers"
          ? "review"
          : merged.pageType === "declaration"
            ? "declaration"
            : merged.pageType === "result"
              ? "result"
              : "questions";

    if (page.role === "review" && !page.review)
      page.review = { questions: "preceding", emptyAnswers: "omit", changeLinks: true };

    if (page.role !== "review") delete page.review;

    if ("pageId" in patch && typeof patch.pageId === "string") page.id = patch.pageId;

    if ("hidden" in patch) page.visible = patch.hidden !== true;

    for (const [key, nativeKey] of [
      ["button", "nextLabel"],
      ["backButton", "backLabel"],
    ] as const)
      if (key in patch) {
        const navigation = { ...page.navigation };

        if (patch[key] === undefined) delete navigation[nativeKey];
        else navigation[nativeKey] = String(patch[key]);

        if (Object.keys(navigation).length) page.navigation = navigation;
        else delete page.navigation;
      }

    if ("repeatable" in patch) {
      const repeat = object(patch.repeatable);

      if (patch.repeatable === undefined) delete page.repeat;
      else
        page.repeat = {
          key: page.repeat?.key ?? `${page.id}-items`,
          // oxlint-disable-next-line anti-slop/require-safety-comment-for-type-assertion -- Page repeat bounds may be incomplete while editing; validateFormDefinition checks them on export.
          min: repeat.min as number,
          // oxlint-disable-next-line anti-slop/require-safety-comment-for-type-assertion -- Page repeat bounds may be incomplete while editing; validateFormDefinition checks them on export.
          ...(repeat.max !== undefined && { max: repeat.max as number }),
          addLabel:
            typeof repeat.addAnotherLabel === "string"
              ? repeat.addAnotherLabel
              : "Add another page",
          ...(typeof repeat.instanceLabel === "string" && { itemLabel: repeat.instanceLabel }),
        };
    }

    $setNative(node, { page });
  }

  if (native.listItem && "hidden" in patch)
    $setNative(node, { listItem: { ...native.listItem, visible: patch.hidden !== true } });
  else if (native.content && "hidden" in patch)
    $setNative(node, { content: { ...native.content, visible: patch.hidden !== true } });

  return $setState(node, settingsState, merged);
}
