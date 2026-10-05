/* oxlint-disable anti-slop/no-runtime-typeof -- Native expressions include untagged scalar literals. */
import { useMemo, useState } from "react";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { REDO_COMMAND, UNDO_COMMAND } from "lexical";
import {
  formulaText,
  parseFormula,
  quote,
  tokenizeFormula,
  type FormulaNode,
} from "../../core/formula";
import type { CalculatedBlock, Expression, NativeReferenceValue } from "../../schema/types";
import type { NativeTargets } from "../logic/native-authoring";
import type { Field } from "../logic/queries";
import { FormulaPill } from "./formula-editor";

export type NativeFormula = {
  text: string;
  fields: Field[];
  type: "NUMBER" | "TEXT";
  references: Map<string, NativeReferenceValue>;
  original: Expression;
};

function numberText(value: number): string {
  if (Object.is(value, -0)) return "-0";
  const [coefficient, exponent] = String(value).split("e");

  if (exponent === undefined) return coefficient!;
  const negative = coefficient!.startsWith("-");
  const unsigned = negative ? coefficient!.slice(1) : coefficient!;
  const [whole, fraction = ""] = unsigned.split(".");
  const digits = whole! + fraction;
  const point = whole!.length + Number(exponent);

  const expanded =
    point <= 0
      ? `0.${"0".repeat(-point)}${digits}`
      : point >= digits.length
        ? digits + "0".repeat(point - digits.length)
        : `${digits.slice(0, point)}.${digits.slice(point)}`;

  return negative ? `-${expanded}` : expanded;
}

function referenceToken(reference: NativeReferenceValue): string {
  const kind = "answer" in reference ? "answer" : "value" in reference ? "value" : "context";

  const id =
    "answer" in reference
      ? reference.answer
      : "value" in reference
        ? reference.value
        : reference.context;

  const encoded = Array.from(id, (character) => character.codePointAt(0)!.toString(16)).join("_");
  const scope = "scope" in reference ? (reference.scope ?? "auto") : "auto";

  return `${kind}_${encoded}_${scope}`;
}

/** Text is a presentation of the native tree; unsupported operators keep their structured editor. */
export function nativeFormula(
  value: Expression,
  targets: NativeTargets,
  valueType?: CalculatedBlock["valueType"],
): NativeFormula | null {
  if (typeof value === "boolean" || valueType === "boolean" || valueType === "date") return null;

  if (value === null || value === undefined || Array.isArray(value)) return null;

  let type: NativeFormula["type"] = valueType === "string" ? "TEXT" : "NUMBER";

  if (typeof value === "string") type = "TEXT";
  else if (typeof value === "number") type = "NUMBER";
  else if ("op" in value) type = value.op === "concat" ? "TEXT" : "NUMBER";
  else if ("answer" in value && valueType === undefined) {
    const kind = targets.questions.find((field) => field.value === value.answer)?.kind;

    if (kind === "date" || kind === "time") return null;
    type = kind === "number" ? "NUMBER" : "TEXT";
  } else if ("value" in value && valueType === undefined) {
    const kind = targets.calculated.find((field) => field.value === value.value)?.kind;

    if (kind === "boolean" || kind === "date") return null;
    type = kind === "string" ? "TEXT" : "NUMBER";
  } else if ("context" in value) {
    if (value.context !== "submissionReference") return null;
    type = "TEXT";
  }

  const fields: Field[] = [];
  const references = new Map<string, NativeReferenceValue>();

  const register = (reference: NativeReferenceValue): string => {
    const token = referenceToken(reference);

    if (references.has(token)) return `{{${token}}}`;
    references.set(token, reference);

    const question =
      "answer" in reference
        ? targets.questions.find((field) => field.value === reference.answer)
        : undefined;

    const calculated =
      "value" in reference
        ? targets.calculated.find((field) => field.value === reference.value)
        : undefined;

    const context = "context" in reference ? reference.context : undefined;

    const label =
      question?.label ??
      calculated?.label ??
      (context === "today"
        ? "Today"
        : context === "submittedAt"
          ? "Submission date and time"
          : context === "submissionReference"
            ? "Submission reference"
            : "Unavailable field");

    const scope = "scope" in reference ? reference.scope : undefined;

    fields.push({
      key: token,
      type:
        "answer" in reference
          ? "INPUT_FIELD"
          : "value" in reference
            ? "CALCULATED_FIELD"
            : "METADATA",
      kind: question?.kind ?? (calculated?.kind === "string" ? "TEXT" : "NUMBER"),
      title:
        label +
        (scope === "current" ? " (same repeated entry)" : scope === "form" ? " (whole form)" : ""),
      capabilities: { formula: true, comparisons: [] },
    });

    return `{{${token}}}`;
  };

  const serialize = (expression: Expression): string | null => {
    if (typeof expression === "number")
      return Number.isFinite(expression) ? numberText(expression) : null;

    if (typeof expression === "string")
      return type === "TEXT" && !/\{\{[\w-]+(?::[\w-]+)?\}\}/.test(expression)
        ? quote(expression)
        : null;

    if (typeof expression === "boolean") return null;

    if (!expression || typeof expression !== "object" || Array.isArray(expression)) return null;

    if (!("op" in expression))
      return "answer" in expression || "value" in expression || "context" in expression
        ? register(expression)
        : null;

    if (!Array.isArray(expression.args)) return null;

    const sign =
      expression.op === "concat" && type === "TEXT"
        ? "+"
        : type === "NUMBER"
          ? expression.op === "add"
            ? "+"
            : expression.op === "subtract"
              ? "-"
              : expression.op === "multiply"
                ? "*"
                : expression.op === "divide"
                  ? "/"
                  : null
          : null;

    if (!sign || expression.args.length !== 2) return null;
    const arguments_: string[] = [];

    for (const argument of expression.args) {
      const text = serialize(argument);

      if (text === null) return null;
      arguments_.push(text);
    }

    return `(${arguments_.join(` ${sign} `)})`;
  };

  const text = serialize(value);

  if (text === null) return null;

  for (const question of targets.questions) register({ answer: question.value });

  for (const calculated of targets.calculated) register({ value: calculated.value });
  register({ context: "submissionReference" });

  return { text, fields, type, references, original: value };
}

export function parseNativeFormula(
  text: string,
  formula: NativeFormula,
): { value: Expression } | { error: string } {
  const parsed = parseFormula(text, formula.type);

  if ("error" in parsed) return { error: parsed.error };
  const tokens = tokenizeFormula(text)!;

  // Opening, rendering and whitespace edits preserve the original tree and explicit reference scopes.
  if (formulaText(tokens) === formulaText(tokenizeFormula(formula.text)!))
    return { value: formula.original };

  const convert = (node: FormulaNode): Expression | null => {
    if (node.type === "NumberLiteral") {
      const number = Number(node.value);

      return Number.isFinite(number) ? number : null;
    }

    if (node.type === "StringLiteral") return node.value;

    if (node.type === "FieldReference") return formula.references.get(node.field) ?? null;

    if (node.type === "UnaryExpression") {
      const operand = convert(node.operand);

      return operand === null
        ? null
        : typeof operand === "number"
          ? -operand
          : { op: "subtract", args: [0, operand] };
    }

    const left = convert(node.left);
    const right = convert(node.right);

    if (left === null || right === null) return null;

    return {
      op:
        formula.type === "TEXT"
          ? "concat"
          : node.operator === "+"
            ? "add"
            : node.operator === "-"
              ? "subtract"
              : node.operator === "*"
                ? "multiply"
                : "divide",
      args: [left, right],
    };
  };

  const value = convert(parsed.ast);

  return value === null
    ? { error: "This formula has an unavailable reference or number." }
    : { value };
}

export function NativeFormulaPill({
  value,
  targets,
  onChange,
  label,
  valueType,
}: {
  value: Expression;
  targets: NativeTargets;
  onChange(value: Expression): void;
  label: string;
  valueType?: CalculatedBlock["valueType"];
}) {
  const [editor] = useLexicalComposerContext();

  const formula = useMemo(
    () => nativeFormula(value, targets, valueType),
    [value, targets, valueType],
  );

  const source = JSON.stringify(value);
  const [previous, setPrevious] = useState(source);
  const [draft, setDraft] = useState<{ source: string; text: string } | null>(null);

  if (previous !== source) {
    setPrevious(source);

    if (draft && draft.source !== source) setDraft(null);
  }

  if (!formula) return null;

  const checked = draft ? parseNativeFormula(draft.text, formula) : null;
  const error = checked && "error" in checked ? checked.error : null;

  return (
    <span
      role="group"
      aria-label={label}
      className="inline-flex max-w-full min-w-0 flex-col items-start"
      onKeyDownCapture={(event) => {
        const key = event.key.toLowerCase();

        if (
          !editor.isEditable() ||
          event.altKey ||
          !(event.ctrlKey || event.metaKey) ||
          (key !== "z" && !(key === "y" && event.ctrlKey))
        )
          return;
        event.preventDefault();
        event.stopPropagation();
        setDraft(null);
        editor.dispatchCommand(
          key === "y" || event.shiftKey ? REDO_COMMAND : UNDO_COMMAND,
          undefined,
        );
      }}
    >
      <FormulaPill
        expression={draft?.text ?? formula.text}
        fields={formula.fields}
        type={formula.type}
        onChange={(text) => {
          const next = parseNativeFormula(text, formula);

          setDraft({ source: "value" in next ? JSON.stringify(next.value) : source, text });

          if ("value" in next && next.value !== value) onChange(next.value);
        }}
      />
      {error && (
        <span role="alert" className="mt-1 text-12 text-error">
          {error}
        </span>
      )}
    </span>
  );
}
