import type { Setting, Settings } from "../model/settings";
import type { NativeValueType, QuestionBase, ValidationRule } from "../formats/native/schema/types";

/** A question in the native JSON, without the label, hint and options its blocks hold. */
export type QuestionData = Omit<QuestionBase, "label" | "hint" | "options">;

/** An edit to a block's settings: a value sets a key, and undefined removes it. */
export type SettingsPatch = Partial<Record<string, Setting | undefined>>;

/**
 * The native question a setting writes into while an edit rebuilds it, with the rules it keeps after and the type of
 * answer its field declares.
 */
export type QuestionDraft = {
  readonly question: QuestionData;
  readonly validation: ValidationRule[];
  readonly valueType?: NativeValueType;
};

/**
 * One of a field's own settings, declared once: the editor settings it owns, how they read from the field's native
 * question and how an edit writes them back. Settings every question has, such as required, are in native-settings.ts.
 */
export type QuestionSetting = {
  /** The editor settings it owns, such as relativeDate. */
  readonly keys: readonly string[];
  /** Their values in a native question; a key the question doesn't set stays out. */
  readonly read: (question: QuestionData) => Settings;
  /** Writes an edit to its keys into the draft; merged is every setting once the edit applies. */
  readonly write: (draft: QuestionDraft, patch: SettingsPatch, merged: Settings) => void;
};

/** Declares one of a field's own settings; list it in the field's settings.own (see defineField). */
export function defineSetting(setting: QuestionSetting): QuestionSetting {
  return Object.freeze({ ...setting, keys: Object.freeze([...setting.keys]) });
}

// SAFETY: The condition checks a non-null non-array object; every property remains unknown.
/** A raw JSON value read as an object of unknown values, or {} when it isn't one, such as a question's config. */
export const jsonObject = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

/** A number from what an author typed; anything else stays as typed, so export can report it. */
export const numberFromInput = (value: unknown): unknown =>
  typeof value === "string" && value.trim() && Number.isFinite(Number(value))
    ? Number(value)
    : value;

/** Sets, replaces or, with no value, removes the draft's validation rule of a type, keeping its id and message. */
export function replaceRule(
  draft: QuestionDraft,
  type: ValidationRule["type"],
  value?: Record<string, unknown>,
) {
  const { validation } = draft;
  const index = validation.findIndex((rule) => rule.type === type);
  const previous = index < 0 ? undefined : validation[index];

  if (value === undefined) {
    if (index >= 0) validation.splice(index, 1);

    return;
  }

  // oxlint-disable-next-line anti-slop/require-safety-comment-for-type-assertion -- Validation rows are assembled while inputs may be incomplete; validateFormDefinition checks each final rule contract at export.
  const rule = {
    ...previous,
    id: previous?.id ?? `${draft.question.id}-${type}`,
    type,
    message: previous?.message ?? "",
    ...value,
  } as ValidationRule;

  if (index < 0) validation.push(rule);
  else validation[index] = rule;
}

/**
 * A limit an author switches on, kept as one validation rule whose value is the limit, such as a minimum age; extra
 * goes in the rule too, such as a file size's unit.
 */
export function ruleLimit(
  toggle: string,
  key: string,
  type: Extract<ValidationRule, { value: number }>["type"],
  extra?: Record<string, unknown>,
): QuestionSetting {
  return defineSetting({
    keys: [toggle, key],
    read: (question) => {
      const rule = question.validation?.findLast((item) => item.type === type);

      return rule && "value" in rule ? { [toggle]: true, [key]: rule.value } : {};
    },
    write: (draft, _patch, merged) =>
      replaceRule(
        draft,
        type,
        merged[toggle] ? { value: numberFromInput(merged[key]), ...extra } : undefined,
      ),
  });
}
