import type { SerializedEditorState } from "lexical";
import type { Settings, Setting } from "../core/settings";
import { validatePageSettings } from "../core/pages";
import type { CalculatedBlock, LogicBlock, QuestionOption } from "../schema/types";
import { nativeSemanticEqual } from "../schema/semantics";
import { applyNativeQuestionSettings, nativeQuestionSettings } from "./native-settings";
import { rawNative, type NativeRawNode } from "./native-state";
import { applyNativeFormSettings, nativeFormSettings } from "./native-form-settings";
import type { FormSettings } from "../core/form-settings";

// SAFETY: The condition checks a non-null non-array object; property values remain unknown.
const object = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

const editable = new Set([
  "required",
  "isDisabled",
  "hidden",
  "hideLabel",
  "fieldId",
  "hasDefaultAnswer",
  "defaultAnswer",
  "width",
  "placeholder",
  "mask",
  "step",
  "hasMultipleFiles",
  "fieldArray",
  "errors",
  "pattern",
  "relativeDate",
  "beforeDate",
  "afterDate",
  "dateRange",
  "specificDates",
  "allowedFiles",
  "hasMinCharacters",
  "minCharacters",
  "hasMaxCharacters",
  "maxCharacters",
  "hasMinNumber",
  "minNumber",
  "hasMaxNumber",
  "maxNumber",
  "hasMinChoices",
  "minChoices",
  "hasMaxChoices",
  "maxChoices",
  "hasMinAge",
  "minAge",
  "hasMaxAge",
  "maxAge",
  "hasMinFiles",
  "minFiles",
  "hasMaxFiles",
  "maxFiles",
  "hasMaxFileSize",
  "maxFileSize",
]);

/** Source controls are editable projections. Apply their deltas after Markdown's own preservation check. */
export function syncNativeSource(state: SerializedEditorState): SerializedEditorState {
  const result = structuredClone(state),
    // oxlint-disable-next-line anti-slop/require-safety-comment-for-type-assertion -- Markdown hydration preserves raw Lexical NodeState for editing; validateFormDefinition checks native metadata at export.
    nodes = result.root.children as NativeRawNode[];

  for (const node of nodes) {
    const native = rawNative(node),
      // oxlint-disable-next-line anti-slop/require-safety-comment-for-type-assertion -- Source settings remain provisional authoring data; their values are retained for converter diagnostics rather than coerced here.
      settings = object(node.$?.settings) as Settings;

    if (native.page) {
      const error = validatePageSettings(node.$?.settings);

      if (error) throw new Error(error);
    }

    if (native.form) {
      const expected = nativeFormSettings(native.form),
        actual = object(settings.formSettings),
        patch: Record<string, unknown> = {};

      for (const key of new Set([...Object.keys(expected), ...Object.keys(actual)]))
        // SAFETY: The union of authored and projected keys is read only for comparison; absent FormSettings properties deliberately evaluate to undefined.
        if (!nativeSemanticEqual(expected[key as keyof FormSettings], actual[key]))
          patch[key] = actual[key];
      // oxlint-disable-next-line anti-slop/require-safety-comment-for-type-assertion -- Unapplied source properties remain editable form-setting deltas; validateFormDefinition validates the resulting native form at export.
      native.form = applyNativeFormSettings(native.form, patch as Partial<FormSettings>);
    }

    if (native.question) {
      const projected = nativeQuestionSettings(native.question);

      if (native.option) {
        if (native.option.visible !== undefined) projected.hidden = !native.option.visible;
      }

      const patch: Partial<Record<string, Setting | undefined>> = {};

      for (const key of editable)
        if (
          !nativeSemanticEqual(projected[key], settings[key]) &&
          (Object.hasOwn(projected, key) || Object.hasOwn(settings, key))
        )
          patch[key] = settings[key];

      // A missing source alias does not erase the native submitted identity.
      if (!Object.hasOwn(settings, "fieldId")) delete patch.fieldId;

      if (native.option) delete patch.hidden;
      native.question = applyNativeQuestionSettings(native.question, patch, settings);

      if (native.option) {
        const value = settings.optionValue;

        if (value !== undefined && String(value) !== String(native.option.value))
          native.option.value =
            typeof native.option.value === "number" &&
            typeof value === "string" &&
            value.trim() !== "" &&
            Number.isFinite(Number(value))
              ? Number(value)
              : typeof native.option.value === "boolean" && (value === "true" || value === "false")
                ? value === "true"
                : // oxlint-disable-next-line anti-slop/require-safety-comment-for-type-assertion -- Unrecognized option input must survive source Apply unchanged so native option-value validation can report it.
                  (value as string | number | boolean);
        const previous = projected.hidden;

        if (!nativeSemanticEqual(previous, settings.hidden))
          native.option.visible = settings.hidden !== true;
      }

      if (settings.nativeOptions !== undefined)
        // oxlint-disable-next-line anti-slop/require-safety-comment-for-type-assertion -- Editable source may contain invalid option rows; preserve them for native option validation rather than dropping rows.
        native.options = structuredClone(settings.nativeOptions) as QuestionOption[];

      if (settings.nativeGroups !== undefined)
        native.question.config = {
          ...object(native.question.config),
          groups: structuredClone(settings.nativeGroups),
        };
    }

    if (Object.hasOwn(settings, "native")) {
      // oxlint-disable-next-line anti-slop/require-safety-comment-for-type-assertion -- Source Apply retains incomplete conditional logic; validateFormDefinition checks rule and action contracts on export.
      if (native.logic) native.logic = structuredClone(settings.native) as LogicBlock;

      if (native.calculated)
        // oxlint-disable-next-line anti-slop/require-safety-comment-for-type-assertion -- Source Apply retains incomplete calculated values; validateFormDefinition checks expression contracts on export.
        native.calculated = structuredClone(settings.native) as CalculatedBlock;
    }

    if (native.page) {
      const role = settings.confirmation
        ? "confirmation"
        : settings.pageType === "check-answers"
          ? "review"
          : settings.pageType === "declaration"
            ? "declaration"
            : settings.pageType === "result"
              ? "result"
              : "questions";

      if (native.page.role !== role) {
        native.page.role = role;

        if (role === "review" && !native.page.review)
          native.page.review = { questions: "preceding", emptyAnswers: "omit", changeLinks: true };

        if (role !== "review") delete native.page.review;
      }

      const visible = native.page.visible === undefined ? undefined : !native.page.visible;

      if (!nativeSemanticEqual(visible, settings.hidden))
        native.page.visible = settings.hidden !== true;
      const repeat = native.page.repeat;

      const repeatProjection = repeat
        ? {
            min: repeat.min,
            ...(repeat.max !== undefined && { max: repeat.max }),
            addAnotherLabel: repeat.addLabel,
            ...(repeat.itemLabel !== undefined && { instanceLabel: repeat.itemLabel }),
          }
        : undefined;

      if (!nativeSemanticEqual(repeatProjection, settings.repeatable)) {
        if (settings.repeatable === undefined) delete native.page.repeat;
        else {
          const value = object(settings.repeatable);
          native.page.repeat = {
            key: repeat?.key ?? `${native.page.id}-items`,
            // oxlint-disable-next-line anti-slop/require-safety-comment-for-type-assertion -- Source repeat bounds are provisional authoring values; validateFormDefinition reports invalid bounds during export.
            min: value.min as number,
            // oxlint-disable-next-line anti-slop/require-safety-comment-for-type-assertion -- Source repeat bounds are provisional authoring values; validateFormDefinition reports invalid bounds during export.
            ...(value.max !== undefined && { max: value.max as number }),
            addLabel:
              typeof value.addAnotherLabel === "string"
                ? value.addAnotherLabel
                : "Add another page",
            ...(typeof value.instanceLabel === "string" && { itemLabel: value.instanceLabel }),
          };
        }
      }

      for (const [key, name] of [
        ["button", "nextLabel"],
        ["backButton", "backLabel"],
      ] as const) {
        if (nativeSemanticEqual(native.page.navigation?.[name], settings[key])) continue;
        const navigation = { ...native.page.navigation };

        if (settings[key] === undefined) delete navigation[name];
        else navigation[name] = String(settings[key]);

        if (Object.keys(navigation).length) native.page.navigation = navigation;
        else delete native.page.navigation;
      }
    }

    if (native.listItem) {
      const previous =
        native.listItem.visible === undefined && native.content?.visible === undefined
          ? undefined
          : native.listItem.visible === false || native.content?.visible === false;

      if (previous !== settings.hidden) native.listItem.visible = settings.hidden !== true;
    } else if (native.content && !native.hintOwner) {
      const previous = native.content.visible === undefined ? undefined : !native.content.visible;

      if (previous !== settings.hidden) native.content.visible = settings.hidden !== true;
    }
  }

  return result;
}
