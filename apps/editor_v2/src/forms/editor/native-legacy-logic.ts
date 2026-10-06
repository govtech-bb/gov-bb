import type {
  Condition as LegacyCondition,
  Action as LegacyAction,
  LogicValue,
} from "../core/logic";
import { parseFormula, type FormulaNode } from "../core/formula";
import type {
  Condition,
  Expression,
  LogicAction,
  NativeReferenceValue,
  VisibilityTarget,
} from "../schema/types";

export type LegacyNativeReferences = {
  values: ReadonlySet<string>;
  textValues: ReadonlySet<string>;
  options: ReadonlyMap<string, { question: string; option: string }>;
  targets: ReadonlyMap<string, VisibilityTarget>;
};

function known(value: object, keys: string[]) {
  const key = Object.keys(value).find((key) => !keys.includes(key));

  if (key) throw new Error(`The legacy property “${key}” needs a native mapping`);
}

export function legacyNativeReference(
  field: string,
  refs: LegacyNativeReferences,
): NativeReferenceValue {
  if (field === "utility::today()") return { context: "today" };

  if (["id", "respondentId", "formName", "0"].includes(field))
    throw new Error(`Legacy context ${field} needs an explicit native reference`);

  return refs.values.has(field) ? { value: field } : { answer: field };
}

function literal(value: LogicValue | undefined, refs: LegacyNativeReferences): Expression {
  if (value === undefined || Array.isArray(value))
    throw new Error("Complete this value before native conversion");

  if (typeof value === "object") {
    if (value === null || typeof value.field !== "string")
      throw new Error("Choose a value reference");
    known(value, ["field"]);
  }

  return typeof value === "object" ? legacyNativeReference(value.field, refs) : value;
}

export function legacyNativeFormula(
  source: string,
  type: "NUMBER" | "TEXT",
  refs: LegacyNativeReferences,
): Expression {
  const parsed = parseFormula(source, type);

  if (!("ast" in parsed)) throw new Error(parsed.error);

  const convert = (node: FormulaNode): Expression => {
    if (node.type === "NumberLiteral") return Number(node.value);

    if (node.type === "StringLiteral") return node.value;

    if (node.type === "FieldReference") return legacyNativeReference(node.field, refs);

    if (node.type === "UnaryExpression")
      return { op: "multiply", args: [-1, convert(node.operand)] };

    const left = convert(node.left),
      right = convert(node.right);

    const text = (value: Expression, original: FormulaNode): Expression =>
      original.type === "StringLiteral" ||
      (original.type === "FieldReference" && refs.textValues.has(original.field))
        ? value
        : { op: "toText", args: [value] };

    if (type === "TEXT")
      return { op: "concat", args: [text(left, node.left), text(right, node.right)] };

    return {
      op: ({ "+": "add", "-": "subtract", "*": "multiply", "/": "divide" } as const)[node.operator],
      args: [left, right],
    };
  };

  return convert(parsed.ast);
}

export function legacyNativeCondition(
  condition: LegacyCondition,
  refs: LegacyNativeReferences,
): Condition {
  known(
    condition,
    condition.type === "GROUP"
      ? ["id", "type", "logicalOperator", "conditionals"]
      : ["id", "type", "field", "comparison", "value", "transform", "valueIsLiteral"],
  );

  if (condition.type === "GROUP" && !["AND", "OR"].includes(condition.logicalOperator))
    throw new Error("Choose All or Any for this condition group");

  if (condition.type !== "GROUP" && condition.type !== "SINGLE")
    throw new Error("Choose a supported condition type");

  if (condition.type === "GROUP")
    return {
      op: condition.logicalOperator === "OR" ? "any" : "all",
      conditions: condition.conditionals.map((value) => legacyNativeCondition(value, refs)),
    };

  if (!condition.field || !condition.comparison) throw new Error("Choose an answer and comparison");
  let left: Expression = legacyNativeReference(condition.field, refs);

  if (condition.transform) {
    if (!["yearsSince", "monthsSince", "daysSince", "daysUntil"].includes(condition.transform))
      throw new Error("Choose a supported date transform");
    const today: Expression = { context: "today" };
    left =
      condition.transform === "yearsSince"
        ? { op: "wholeYearsBetween", args: [left, today] }
        : condition.transform === "monthsSince"
          ? { op: "monthsBetween", args: [left, today] }
          : {
              op: "daysBetween",
              args: condition.transform === "daysUntil" ? [today, left] : [left, today],
            };
  }

  const negate = (value: Condition): Condition => ({ op: "not", condition: value });

  if (condition.comparison === "IS_EMPTY") return { op: "empty", value: left };

  if (condition.comparison === "IS_NOT_EMPTY") return negate({ op: "empty", value: left });
  const options = Array.isArray(condition.value) ? condition.value : [condition.value];

  const selected = options.map((value) =>
    typeof value === "string" ? refs.options.get(value) : undefined,
  );

  if (
    !condition.valueIsLiteral &&
    selected.length &&
    selected.every((option) => option?.question === condition.field)
  ) {
    const choices: Condition[] = selected.map((option) => ({
      op: "selected",
      question: option!.question,
      option: option!.option,
    }));

    const combined =
      choices.length === 1
        ? choices[0]!
        : {
            op: condition.comparison === "IS_EVERY_OF" ? ("all" as const) : ("any" as const),
            conditions: choices,
          };

    return ["IS_NOT", "IS_NOT_ANY_OF", "DOES_NOT_CONTAIN"].includes(condition.comparison)
      ? negate(combined)
      : combined;
  }

  if (Array.isArray(condition.value)) {
    const checks: Condition[] = condition.value.map((value) => ({ op: "eq", left, right: value }));

    if (condition.comparison === "IS_ANY_OF") return { op: "any", conditions: checks };

    if (condition.comparison === "IS_NOT_ANY_OF") return negate({ op: "any", conditions: checks });
    throw new Error("This collection comparison needs a native module binding");
  }

  const op = {
    IS: "eq",
    IS_NOT: "ne",
    EQUAL: "eq",
    NOT_EQUAL: "ne",
    GREATER_THAN: "gt",
    LESS_THAN: "lt",
    GREATER_OR_EQUAL_THAN: "gte",
    LESS_OR_EQUAL_THAN: "lte",
    IS_BEFORE: "lt",
    IS_AFTER: "gt",
    CONTAINS: "contains",
    DOES_NOT_CONTAIN: "contains",
    STARTS_WITH: "startsWith",
    DOES_NOT_START_WITH: "startsWith",
    ENDS_WITH: "endsWith",
    DOES_NOT_END_WITH: "endsWith",
  } as const;

  if (!(condition.comparison in op))
    throw new Error(`Unsupported legacy comparison: ${condition.comparison}`);

  // SAFETY: the membership guard above establishes that this comparison is one of the table's own literal keys.
  const comparison: Condition = {
    op: op[condition.comparison as keyof typeof op],
    left,
    right: literal(condition.value, refs),
  };

  return condition.comparison.startsWith("DOES_NOT_") ? negate(comparison) : comparison;
}

export function legacyNativeAction(
  action: LegacyAction,
  refs: LegacyNativeReferences,
): LogicAction {
  const owned: Partial<Record<NonNullable<LegacyAction["type"]>, string>> = {
    SHOW_BLOCKS: "showBlocks",
    HIDE_BLOCKS: "hideBlocks",
    REQUIRE_ANSWER: "requireAnswer",
    CHANGE_LABEL: "changeLabel",
    CHANGE_PAGE_TITLE: "changePageTitle",
    JUMP_TO_PAGE: "jumpToPage",
    CALCULATE: "calculate",
  };

  known(action, [
    "id",
    "type",
    ...(action.type && owned[action.type] ? [owned[action.type]!] : []),
  ]);

  if (action.changeLabel) known(action.changeLabel, ["target", "text"]);

  if (action.changePageTitle) known(action.changePageTitle, ["target", "text"]);

  if (action.calculate)
    known(action.calculate, [
      "field",
      "operator",
      ...(action.calculate.operator === "FORMULA" ? ["expression"] : ["value"]),
    ]);

  const target = (value?: string) => {
    if (!value) throw new Error("Choose an action target");

    return value;
  };

  switch (action.type) {
    case "SHOW_BLOCKS":
      return {
        type: "setVisible",
        targets: (action.showBlocks ?? []).map((id) => refs.targets.get(id) ?? id),
        value: true,
      };
    case "HIDE_BLOCKS":
      return {
        type: "setVisible",
        targets: (action.hideBlocks ?? []).map((id) => refs.targets.get(id) ?? id),
        value: false,
      };
    case "REQUIRE_ANSWER":
      return { type: "setRequired", target: target(action.requireAnswer), value: true };
    case "CHANGE_LABEL":
      return {
        type: "setLabel",
        target: target(action.changeLabel?.target),
        value: action.changeLabel?.text ?? "",
      };
    case "CHANGE_PAGE_TITLE":
      return {
        type: "setTitle",
        target: target(action.changePageTitle?.target),
        value: action.changePageTitle?.text ?? "",
      };
    case "JUMP_TO_PAGE":
      return { type: "goTo", target: target(action.jumpToPage) };
    case "HIDE_BUTTON_TO_DISABLE_COMPLETION":
      return { type: "setCompletionEnabled", value: false };
    case "CALCULATE": {
      const calculation = action.calculate;
      const id = target(calculation?.field);

      if (calculation?.operator === "ASSIGNMENT")
        return { type: "setValue", target: id, value: literal(calculation.value, refs) };

      if (calculation?.operator === "FORMULA")
        return {
          type: "setValue",
          target: id,
          value: legacyNativeFormula(
            calculation.expression ?? "",
            refs.textValues.has(id) ? "TEXT" : "NUMBER",
            refs,
          ),
        };
      throw new Error(
        "This sequential accumulator needs explicit intermediate values before native conversion",
      );
    }

    default:
      throw new Error("Choose a supported native action");
  }
}
