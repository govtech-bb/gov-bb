// Compile/parse helpers between the builder's editable conditional-amount table
// and the JSONLogic `if`-chain persisted in a payment processor's `amount` slot
// (#937). The structured table is builder-UI state only — nothing downstream
// knows about it. The server resolves the stored `if`-chain via
// `@govtech-bb/expressions` exactly as it already resolves any other dynamic
// amount, so this file changes no stored format and no server path.
//
// Equality-only slice: operators are `equal`/`notEqual`. The maps and guards
// are written so adding ordering operators (`<`, `<=`, …) or a calculated-field
// reference (age from DOB) later is additive, not a rewrite — see the #937 fast
// follow.

export type AmountOperator = "equal" | "notEqual";

export interface AmountRule {
  /** A `stepId.fieldId` value path, as emitted by ValuePathPicker. */
  field: string;
  operator: AmountOperator;
  /** Comparison value. The editor only ever emits strings. */
  value: string;
  /** Amount charged when this rule matches. Non-negative. */
  amount: number;
}

export interface ConditionalAmount {
  rules: AmountRule[];
  /** Charged when no rule matches ("otherwise charge…"). Mandatory. */
  default: number;
}

export type ParsedAmount =
  | { kind: "fixed"; amount: number | undefined }
  | { kind: "conditional"; conditional: ConditionalAmount }
  | { kind: "advanced"; raw: Record<string, unknown> };

// operator → JSONLogic comparison key, and its inverse for the parse direction.
const OP_TO_JSONLOGIC: Record<AmountOperator, string> = {
  equal: "==",
  notEqual: "!=",
};
const JSONLOGIC_TO_OP: Record<string, AmountOperator> = {
  "==": "equal",
  "!=": "notEqual",
};

/**
 * Compile the editable table to the value stored in `amount`. With no rules the
 * `if`-chain would be a bare default, so we store the default number directly —
 * indistinguishable from a fixed amount, which is correct.
 */
export function compileAmount(
  conditional: ConditionalAmount,
): number | Record<string, unknown> {
  if (conditional.rules.length === 0) return conditional.default;

  const chain: unknown[] = [];
  for (const rule of conditional.rules) {
    chain.push({
      [OP_TO_JSONLOGIC[rule.operator]]: [{ var: rule.field }, rule.value],
    });
    chain.push(rule.amount);
  }
  chain.push(conditional.default);
  return { if: chain };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// Decompile one `{ op: [{ var }, value] }` condition, or null if it isn't a
// shape this editor emits (unknown op, non-var lhs, non-string comparison).
function parseCondition(cond: unknown): Omit<AmountRule, "amount"> | null {
  if (!isPlainObject(cond)) return null;
  const keys = Object.keys(cond);
  if (keys.length !== 1) return null;
  const operator = JSONLOGIC_TO_OP[keys[0]];
  if (!operator) return null;

  const operands = cond[keys[0]];
  if (!Array.isArray(operands) || operands.length !== 2) return null;
  const [lhs, rhs] = operands;
  if (!isPlainObject(lhs) || typeof lhs.var !== "string") return null;
  if (typeof rhs !== "string") return null;

  return { field: lhs.var, operator, value: rhs };
}

/**
 * Classify a stored `amount` for the editor. A plain number (or unset) is a
 * fixed amount; an `if`-chain in exactly the shape `compileAmount` emits is a
 * conditional table; anything else (a hand- or AI-authored expression) is
 * surfaced read-only as `advanced` so the editor never clobbers it.
 */
export function parseAmount(value: unknown): ParsedAmount {
  if (value === undefined) return { kind: "fixed", amount: undefined };
  if (typeof value === "number") return { kind: "fixed", amount: value };
  if (!isPlainObject(value)) return { kind: "fixed", amount: undefined };

  const advanced: ParsedAmount = { kind: "advanced", raw: value };

  const keys = Object.keys(value);
  if (keys.length !== 1 || keys[0] !== "if") return advanced;

  const chain = value.if;
  // Our chain is [cond, amount, …, default] — odd length, at least one pair.
  if (!Array.isArray(chain) || chain.length < 3 || chain.length % 2 === 0) {
    return advanced;
  }

  const rules: AmountRule[] = [];
  for (let i = 0; i < chain.length - 1; i += 2) {
    const condition = parseCondition(chain[i]);
    const amount = chain[i + 1];
    if (!condition || typeof amount !== "number") return advanced;
    rules.push({ ...condition, amount });
  }

  const def = chain[chain.length - 1];
  if (typeof def !== "number") return advanced;

  return { kind: "conditional", conditional: { rules, default: def } };
}
