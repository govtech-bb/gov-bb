import { isTodayContext } from "../model/dates";
import type { Settings } from "../model/settings";
import type { ValidationRule } from "../formats/native/schema/types";
import {
  defineSetting,
  jsonObject,
  replaceRule,
  ruleLimit,
  type QuestionDraft,
} from "../settings/define-setting";

/** Sets or removes the draft's date rule of a type, against today or against a day, keeping its id and message. */
function setDateRule(
  draft: QuestionDraft,
  type: "dateBefore" | "dateAfter",
  today: boolean,
  value?: Record<string, unknown>,
) {
  const { validation } = draft;

  const index = validation.findIndex(
    (rule) => rule.type === type && isTodayContext(rule.value) === today,
  );

  const previous = index < 0 ? undefined : validation[index];

  if (!value) {
    if (index >= 0) validation.splice(index, 1);

    return;
  }

  // oxlint-disable-next-line anti-slop/require-safety-comment-for-type-assertion -- Date-validation rows are assembled while inputs may be incomplete; validateFormDefinition checks each final rule contract at export.
  const nextRule = {
    ...previous,
    id: previous?.id ?? `${draft.question.id}-${type}${today ? "-today" : ""}`,
    message: previous?.message ?? "",
    type,
    ...value,
  } as ValidationRule;

  if (index < 0) validation.push(nextRule);
  else validation[index] = nextRule;
}

/**
 * Past or future, before or after a day, a range, or set days, kept as the question's date rules: "past" is a
 * dateBefore rule against today, and a range is a dateAfter and a dateBefore rule that both include their day.
 */
export const dateLimits = defineSetting({
  keys: ["relativeDate", "beforeDate", "afterDate", "dateRange", "specificDates"],
  read(question) {
    const settings: Settings = {};

    for (const rule of question.validation ?? []) {
      if (rule.type === "dateBefore" || rule.type === "dateAfter") {
        if (isTodayContext(rule.value))
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

    return settings;
  },
  write(draft, patch, merged) {
    for (const [key, type] of [
      ["beforeDate", "dateBefore"],
      ["afterDate", "dateAfter"],
    ] as const)
      if (key in patch)
        setDateRule(
          draft,
          type,
          false,
          merged[key] ? { value: merged[key], inclusive: false } : undefined,
        );

    if ("relativeDate" in patch) {
      const relative = merged.relativeDate;

      for (const type of ["dateBefore", "dateAfter"] as const)
        setDateRule(
          draft,
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
      const range = jsonObject(merged.dateRange);
      setDateRule(
        draft,
        "dateAfter",
        false,
        typeof range.from === "string" ? { value: range.from, inclusive: true } : undefined,
      );
      setDateRule(
        draft,
        "dateBefore",
        false,
        typeof range.to === "string" ? { value: range.to, inclusive: true } : undefined,
      );
    }

    if ("specificDates" in patch)
      replaceRule(
        draft,
        "dateIn",
        Array.isArray(merged.specificDates) && merged.specificDates.length
          ? { value: merged.specificDates }
          : undefined,
      );
  },
});

/** The youngest and oldest the person answering may be, worked out from the date they give. */
export const ageLimits = [
  ruleLimit("hasMinAge", "minAge", "minAge"),
  ruleLimit("hasMaxAge", "maxAge", "maxAge"),
];
