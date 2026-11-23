import type { Condition } from "./logic";

type Single = Extract<Condition, { type: "SINGLE" }>;

export const ageComparisons = [
  "EQUAL",
  "NOT_EQUAL",
  "GREATER_THAN",
  "LESS_THAN",
  "GREATER_OR_EQUAL_THAN",
  "LESS_OR_EQUAL_THAN",
] as const;

/** Mode changes are explicit edits, keeping numeric ages out of the date picker. */
export function conditionMode(condition: Single, age: boolean): Single {
  const { transform: _, ...rest } = condition;

  return {
    ...rest,
    ...(age && { transform: "yearsSince" as const }),
    comparison: age ? "GREATER_OR_EQUAL_THAN" : "IS",
    value: "",
  };
}

export function ageConditionError(condition: Single, kind?: string): string | undefined {
  if (condition.transform !== "yearsSince") return undefined;

  if (kind !== "date") return "Age in years needs a date answer";

  if (!ageComparisons.some((comparison) => comparison === condition.comparison))
    return "Choose a numeric age comparison";

  if (
    typeof condition.value !== "number" ||
    !Number.isFinite(condition.value) ||
    !Number.isInteger(condition.value) ||
    condition.value < 0
  )
    return "Enter an age as a whole number of years, zero or more";
}
