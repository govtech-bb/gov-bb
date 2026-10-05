import type { Comparison } from "../../core/logic";
import { ageComparisons } from "../../core/logic-age";
import { type Field } from "./queries";

export const empty: Comparison[] = ["IS_EMPTY", "IS_NOT_EMPTY"];

export const numeric: Comparison[] = [
  "EQUAL",
  "NOT_EQUAL",
  "GREATER_THAN",
  "LESS_THAN",
  "GREATER_OR_EQUAL_THAN",
  "LESS_OR_EQUAL_THAN",
];

export const dated: Comparison[] = ["IS", "IS_NOT", "IS_BEFORE", "IS_AFTER"];

export const textual: Comparison[] = [
  "IS",
  "IS_NOT",
  "CONTAINS",
  "DOES_NOT_CONTAIN",
  "STARTS_WITH",
  "DOES_NOT_START_WITH",
  "ENDS_WITH",
  "DOES_NOT_END_WITH",
];

export const anyOf: Comparison[] = ["IS_ANY_OF", "IS_NOT_ANY_OF", "IS_EVERY_OF"];

export const many: Comparison[] = ["CONTAINS", "DOES_NOT_CONTAIN", ...empty, ...anyOf];

export const single: Comparison[] = ["IS", "IS_NOT", ...empty, "IS_ANY_OF", "IS_NOT_ANY_OF"];

/** The comparisons a field offers, by its type. */
export function comparisons(field?: Field, transform?: "yearsSince"): Comparison[] {
  if (!field) return [];

  if (field.kind === "date" && transform === "yearsSince") return [...ageComparisons];

  if (field.type === "CALCULATED_FIELD") return field.kind === "NUMBER" ? numeric : textual;

  if (field.type !== "INPUT_FIELD") return [...textual, ...empty];
  const capabilities = field.capabilities;

  if (capabilities) return [...capabilities.comparisons];

  return [];
}

export const comparisonLabels: Record<Comparison, string> = {
  IS: "Is",
  IS_NOT: "Is not",
  IS_ANY_OF: "Is any of",
  IS_NOT_ANY_OF: "Is not any of",
  IS_EVERY_OF: "Is every of",
  CONTAINS: "Contains",
  DOES_NOT_CONTAIN: "Does not contain",
  STARTS_WITH: "Starts with",
  DOES_NOT_START_WITH: "Does not start with",
  ENDS_WITH: "Ends with",
  DOES_NOT_END_WITH: "Does not end with",
  IS_EMPTY: "Is empty",
  IS_NOT_EMPTY: "Is not empty",
  EQUAL: "=",
  NOT_EQUAL: "≠",
  GREATER_THAN: ">",
  LESS_THAN: "<",
  GREATER_OR_EQUAL_THAN: "≥",
  LESS_OR_EQUAL_THAN: "≤",
  IS_BEFORE: "Is before",
  IS_AFTER: "Is after",
};

export const comparisonLabel = (c: Comparison) => comparisonLabels[c];
