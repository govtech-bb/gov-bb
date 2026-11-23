import type { DurationTransform } from "./dynamic-text";
import type { Setting, Settings } from "./settings";

// Legacy logic refers to answers by question ID, calculated values by block:field,
// and submission metadata by its stored key.
export type LogicalOperator = "AND" | "OR";

export type Comparison =
  | "IS"
  | "IS_NOT"
  | "IS_ANY_OF"
  | "IS_NOT_ANY_OF"
  | "IS_EVERY_OF"
  | "CONTAINS"
  | "DOES_NOT_CONTAIN"
  | "STARTS_WITH"
  | "DOES_NOT_START_WITH"
  | "ENDS_WITH"
  | "DOES_NOT_END_WITH"
  | "IS_EMPTY"
  | "IS_NOT_EMPTY"
  | "EQUAL"
  | "NOT_EQUAL"
  | "GREATER_THAN"
  | "LESS_THAN"
  | "GREATER_OR_EQUAL_THAN"
  | "LESS_OR_EQUAL_THAN"
  | "IS_BEFORE"
  | "IS_AFTER";

export type CalculateOperator =
  | "ADDITION"
  | "SUBTRACTION"
  | "MULTIPLICATION"
  | "DIVISION"
  | "ASSIGNMENT"
  | "FORMULA";

export type ActionType =
  | "JUMP_TO_PAGE"
  | "CALCULATE"
  | "REQUIRE_ANSWER"
  | "SHOW_BLOCKS"
  | "HIDE_BLOCKS"
  | "HIDE_BUTTON_TO_DISABLE_COMPLETION"
  | "CHANGE_LABEL"
  | "CHANGE_PAGE_TITLE";

/** A literal, or another field's value. */
export type LogicValue = string | number | boolean | string[] | number[] | { field: string };

export type Condition =
  | {
      id: string;
      type: "SINGLE";
      field?: string;
      comparison?: Comparison;
      value?: LogicValue;
      transform?: DurationTransform;
      valueIsLiteral?: boolean;
    }
  | { id: string; type: "GROUP"; logicalOperator: LogicalOperator; conditionals: Condition[] };

export type Action = {
  id: string;
  type?: ActionType;
  /** Page ID; legacy drafts use "0" for the confirmation page. */
  jumpToPage?: string;
  /** Pages, questions, options or blocks, by id. */
  showBlocks?: string[];
  hideBlocks?: string[];
  /** A question's id. */
  requireAnswer?: string;
  changeLabel?: { target?: string; text?: string };
  changePageTitle?: { target?: string; text?: string };
  /** FORMULA expressions contain space-separated tokens, {{key}} references and quoted strings. */
  calculate?: {
    field?: string;
    operator?: CalculateOperator;
    value?: LogicValue;
    expression?: string;
  };
};

/** Where logic and answers find a calculated field: its block and its own id. */
export const fieldKey = (block: string, field: string) => `${block}:${field}`;

// Preserve the existing read-default behavior for raw draft payloads.
const nested = <T extends Setting>(settings: Settings, key: string) => {
  // oxlint-disable-next-line anti-slop/require-safety-comment-for-type-assertion -- only the owned logic/calculation keys call this reader; incomplete draft values remain intact for preflight diagnostics.
  return settings[key] as T | undefined;
};

export type CalculatedField = {
  id: string;
  name?: string;
  type?: "NUMBER" | "TEXT";
  value?: LogicValue;
};

/** A new block has one empty field; the snapshot's single field (name/fieldType/value) reads as that one. */
export const calculatedFields = (s: Settings) =>
  nested<CalculatedField[]>(s, "calculatedFields") ?? [
    {
      id: "0",
      // oxlint-disable-next-line anti-slop/require-safety-comment-for-type-assertion -- legacy name text is preserved verbatim for draft diagnostics rather than silently normalized on read.
      name: s.name as string | undefined,
      // oxlint-disable-next-line anti-slop/require-safety-comment-for-type-assertion -- the legacy field-type discriminator remains repairable; native conversion validates supported value types.
      type: s.fieldType as CalculatedField["type"],
      // oxlint-disable-next-line anti-slop/require-safety-comment-for-type-assertion -- a legacy initial value stays in the editable draft; preflight/conversion validate its literal or reference before export.
      value: s.value as LogicValue | undefined,
    },
  ];

/** New logic blocks start with one editable condition and action. */
export const conditionalLogic = (s: Settings) => ({
  logicalOperator: s.logicalOperator === "OR" ? ("OR" as const) : ("AND" as const),
  conditionals: nested<Condition[]>(s, "conditionals") ?? [{ id: "0", type: "SINGLE" }],
  actions: nested<Action[]>(s, "actions") ?? [{ id: "0" }],
});
