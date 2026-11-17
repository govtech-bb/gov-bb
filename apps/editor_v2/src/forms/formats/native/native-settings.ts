import { $getRoot, $setState, type LexicalNode } from "lexical";
import {
  $setSettings as $setLegacySettings,
  $settings,
  settingsState,
} from "../../canvas/block-state";
import type { Settings, Setting } from "../../model/settings";
import { resolveNativeField } from "../../native";
import type { FormEditorDefinition } from "../../definition";
import type {
  QuestionData,
  QuestionDraft,
  QuestionSetting,
  SettingsPatch,
} from "../../settings/define-setting";
import {
  answerMask,
  answerPlaceholder,
  answerRepeat,
  answerWidth,
  defaultAnswer,
  errorMessages,
  labelHidden,
  questionDisabled,
  questionHidden,
  questionIdentity,
  questionRequired,
} from "../../settings/shared-settings";
import { $formDefinition } from "../../canvas/form-context";
import { $native, $setNative, type NativeNodeData } from "./native-state";

// SAFETY: The condition checks a non-null non-array object; every property remains unknown.
const object = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

// The settings every question shares, in the order they read: a field's own settings read after them, then the
// error messages over them all
const sharedReads = [
  questionIdentity,
  questionRequired,
  questionHidden,
  questionDisabled,
  labelHidden,
  defaultAnswer,
  answerRepeat,
  answerWidth,
  answerPlaceholder,
  answerMask,
];

// The order they write in: a field's own settings write after them, then error messages and repetition
const sharedWrites = [
  questionRequired,
  questionDisabled,
  questionHidden,
  labelHidden,
  questionIdentity,
  defaultAnswer,
  answerWidth,
  answerPlaceholder,
  answerMask,
];

const sharedLastWrites = [errorMessages, answerRepeat];

/** A question's field, its own settings, and the shared settings its own don't replace. */
function questionSettings(question: QuestionData, definition: FormEditorDefinition) {
  const field = resolveNativeField(question, definition);
  const own = field?.ownSettings ?? [];
  const owned = new Set(own.flatMap((setting) => setting.keys));

  const shared = (settings: readonly QuestionSetting[]) =>
    settings.filter((setting) => !setting.keys.some((key) => owned.has(key)));

  return { field, own, shared };
}

/** Presentation settings are projected from native state; edits write back through $setFormSettings. */
export function nativeQuestionSettings(
  question: QuestionData,
  definition: FormEditorDefinition,
): Settings {
  const { own, shared } = questionSettings(question, definition);
  const settings: Settings = {};

  for (const setting of [...shared(sharedReads), ...own, ...shared([errorMessages])])
    Object.assign(settings, setting.read(question));

  for (const key of Object.keys(settings)) if (settings[key] === undefined) delete settings[key];

  return settings;
}

export function applyNativeQuestionSettings(
  question: QuestionData,
  patch: SettingsPatch,
  merged: Settings,
  definition: FormEditorDefinition,
): QuestionData {
  const next = structuredClone(question);
  const { field, own, shared } = questionSettings(next, definition);
  const validation = [...(next.validation ?? [])];

  const draft: QuestionDraft = {
    question: next,
    validation,
    valueType: field?.native?.valueType,
  };

  for (const setting of [...shared(sharedWrites), ...own, ...shared(sharedLastWrites)])
    if (setting.keys.some((key) => key in patch)) setting.write(draft, patch, merged);

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
      question: applyNativeQuestionSettings(
        native.question,
        questionPatch,
        merged,
        $formDefinition(),
      ),
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
