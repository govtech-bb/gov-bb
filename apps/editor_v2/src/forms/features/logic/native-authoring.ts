import { $getNodeByKey, $setState, type NodeKey } from "lexical";
import { $native, $setNative } from "../../editor/native-state";
import { $formBlocks, $settings, settingsState } from "../../editor/nodes";
import type {
  CalculatedBlock,
  Condition,
  Expression,
  LogicAction,
  LogicBlock,
  NativeReferenceValue,
  VisibilityTarget,
} from "../../schema/types";

export type NativePickItem<T extends string = string> = { value: T; label: string };

export type NativeTargets = {
  questions: (NativePickItem & { kind: string; options: NativePickItem[] })[];
  calculated: (NativePickItem & { kind?: CalculatedBlock["valueType"] })[];
  pages: NativePickItem[];
  visibility: (NativePickItem & { target: VisibilityTarget })[];
};

export function $nativeTargets(): NativeTargets {
  const blocks = $formBlocks(),
    targets: NativeTargets = { questions: [], calculated: [], pages: [], visibility: [] };

  const seen = new Set<string>();

  const title = (id: string, part?: string) =>
    blocks
      .find(
        (node) =>
          $native(node).owner === id &&
          (part ? $native(node).part === part : node.getType() === "page-title"),
      )
      ?.getTextContent();

  const addVisibility = (target: VisibilityTarget, label: string) =>
    targets.visibility.push({ value: JSON.stringify(target), target, label });

  for (const node of blocks) {
    const native = $native(node);

    if (native.question && !seen.has(native.question.id)) {
      const question = native.question,
        label = title(question.id, "label") || question.key || question.id;

      seen.add(question.id);

      const options = native.options
        ? native.options.map((option) => ({
            value: option.id,
            label:
              typeof option.label === "string"
                ? option.label
                : option.label
                    .map((part) =>
                      typeof part === "string" ? part : "text" in part ? part.text : "",
                    )
                    .join("") || option.id,
          }))
        : blocks
            .filter((option) => $native(option).owner === question.id && $native(option).option)
            .map((option) => ({
              value: $native(option).option!.id,
              label: option.getTextContent() || $native(option).option!.id,
            }));

      targets.questions.push({ value: question.id, label, kind: question.kind, options });
      addVisibility(question.id, label);

      for (const part of ["label", "hint", "input"] as const)
        addVisibility({ question: question.id, part }, `${label} — ${part}`);

      for (const option of options)
        addVisibility(
          { question: question.id, option: option.value },
          `${label} — ${option.label}`,
        );
    }

    if (native.calculated)
      targets.calculated.push({
        value: native.calculated.id,
        label: native.calculated.name || native.calculated.key || native.calculated.id,
        kind: native.calculated.valueType,
      });

    if (native.page) {
      const label = title(native.page.id) || native.page.id;
      targets.pages.push({ value: native.page.id, label });

      if (targets.pages.length > 1) addVisibility(native.page.id, label);
    }

    if (native.content && !seen.has(native.content.id)) {
      seen.add(native.content.id);
      addVisibility(native.content.id, node.getTextContent() || native.content.kind);
    }

    if (native.content && native.listItem)
      addVisibility(
        { list: native.content.id, item: native.listItem.id },
        `${node.getTextContent() || "List item"} — item`,
      );
  }

  return targets;
}

/** Both the semantic payload and its widget projection change in the same editor transaction. */
export function $setNativeWidget(nodeKey: NodeKey, block: LogicBlock | CalculatedBlock) {
  const node = $getNodeByKey(nodeKey);

  if (!node) return;
  $setNative(node, block.type === "logic" ? { logic: block } : { calculated: block });
  $setState(node, settingsState, { ...$settings(node), native: block });
}

export const expressionKinds = [
  ["number", "Number"],
  ["string", "Text"],
  ["boolean", "Yes or no"],
  ["answer", "Question answer"],
  ["value", "Calculated value"],
  ["context", "Form information"],
  ["add", "Add"],
  ["subtract", "Subtract"],
  ["multiply", "Multiply"],
  ["divide", "Divide"],
  ["min", "Minimum"],
  ["max", "Maximum"],
  ["round", "Round"],
  ["coalesce", "Use a value when empty"],
  ["lookup", "Look up a value"],
  ["year", "Year from a date"],
  ["monthsBetween", "Months between dates"],
  ["wholeYearsBetween", "Complete years between dates"],
  ["daysBetween", "Days between dates"],
  ["concat", "Join text"],
  ["toText", "Convert to text"],
] as const;

export type ExpressionKind = (typeof expressionKinds)[number][0];

export function expressionKind(value: Expression): ExpressionKind {
  if (typeof value === "number") return "number";

  if (typeof value === "string") return "string";

  if (typeof value === "boolean") return "boolean";

  if ("answer" in value) return "answer";

  if ("value" in value) return "value";

  if ("context" in value) return "context";

  return value.op;
}

export function newExpression(kind: ExpressionKind): Expression {
  if (kind === "number") return 0;

  if (kind === "string") return "";

  if (kind === "boolean") return false;

  if (kind === "answer") return { answer: "" };

  if (kind === "value") return { value: "" };

  if (kind === "context") return { context: "today" };

  if (kind === "round")
    return { op: kind, args: [0], increment: 1, ties: "towardPositiveInfinity" };

  if (kind === "lookup") return { op: kind, args: [""], entries: [], fallback: "" };

  return {
    op: kind,
    args: ["year", "toText"].includes(kind) ? [kind === "year" ? { context: "today" } : 0] : [0, 0],
  };
}

export const conditionKinds = [
  ["eq", "Is equal to"],
  ["ne", "Is not equal to"],
  ["gt", "Is greater than"],
  ["gte", "Is at least"],
  ["lt", "Is less than"],
  ["lte", "Is at most"],
  ["contains", "Contains"],
  ["startsWith", "Starts with"],
  ["endsWith", "Ends with"],
  ["empty", "Is empty"],
  ["selected", "An option is selected"],
  ["all", "All conditions match"],
  ["any", "Any condition matches"],
  ["not", "Condition does not match"],
  ["always", "Always"],
  ["never", "Never"],
] as const;

export type ConditionKind = (typeof conditionKinds)[number][0];

export function newCondition(op: ConditionKind): Condition {
  if (op === "always" || op === "never") return op === "always";

  if (op === "all" || op === "any") return { op, conditions: [newCondition("eq")] };

  if (op === "not") return { op, condition: newCondition("eq") };

  if (op === "empty") return { op, value: { answer: "" } };

  if (op === "selected") return { op, question: "", option: "" };

  return { op, left: { answer: "" }, right: "" };
}

export function changeCondition(value: Condition, op: ConditionKind): Condition {
  const next = newCondition(op);

  if (typeof value === "boolean" || typeof next === "boolean") return next;

  if (value.op === next.op) return value;

  if ("left" in value && "left" in next) return { ...next, left: value.left, right: value.right };

  if ("conditions" in value && "conditions" in next)
    return { ...next, conditions: value.conditions };

  return next;
}

export const actionKinds = [
  ["setVisible", "Show or hide blocks"],
  ["setRequired", "Require an answer"],
  ["setLabel", "Change a question label"],
  ["setTitle", "Change a page heading"],
  ["setValue", "Set a calculated value"],
  ["error", "Show an error"],
  ["goTo", "Go to a page"],
  ["setCompletionEnabled", "Enable or disable Continue"],
] as const;

export function newAction(type: LogicAction["type"]): LogicAction {
  if (type === "setVisible") return { type, targets: [], value: true };

  if (type === "setRequired") return { type, target: "", value: true };

  if (type === "setLabel" || type === "setTitle") return { type, target: "", value: "" };

  if (type === "setValue") return { type, target: "", value: 0 };

  if (type === "error") return { type, target: "", message: "" };

  if (type === "goTo") return { type, target: "" };

  return { type, value: true };
}

export function referenceWithScope<T extends NativeReferenceValue>(reference: T, scope: string): T {
  const next: T & { scope?: string } = { ...reference };

  if (scope) next.scope = scope;
  else delete next.scope;

  return next;
}
