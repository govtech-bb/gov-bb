// Compile/parse helpers between the builder's editable conditional-amount table
// and the JSONLogic `if`-chain persisted in a payment processor's `amount` slot
// (#937). The structured table is builder-UI state only — nothing downstream
// knows about it. The server resolves the stored `if`-chain via
// `@govtech-bb/expressions` exactly as it already resolves any other dynamic
// amount, so this file changes no stored format and no server path.
//
// A rule compares either a field value or the *age* derived from a date field
// (the `age` op, already registered server-side) against a literal, using
// equality or ordering operators. Bands are expressed as ordered rules —
// JSONLogic `if` is first-match, top-down — terminating in a mandatory default.

export type AmountOperator =
  | "equal"
  | "notEqual"
  | "lessThan"
  | "lessThanOrEqual"
  | "greaterThan"
  | "greaterThanOrEqual";

// What a rule compares. `path` is a `stepId.fieldId` value path as emitted by
// ValuePathPicker — the `values.` prefix the runtime resolves against is added
// only at compile time (see VALUES_PREFIX), never stored in the table.
export type AmountSubject =
  | { kind: "field"; path: string }
  | { kind: "age"; path: string };

export interface AmountRule {
  subject: AmountSubject;
  operator: AmountOperator;
  /** Comparison literal: a string for field equality, a number for age/ordering. */
  value: string | number;
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

// Submission answers live under `values` in the resolution context
// (`{ values, meta, submission }`), so a JSONLogic `var` referencing an answer
// must be prefixed. ValuePathPicker emits the bare `stepId.fieldId`; we add and
// strip this prefix at the compile/parse boundary.
const VALUES_PREFIX = "values.";

// operator → JSONLogic comparison key, and its inverse for the parse direction.
const OP_TO_JSONLOGIC: Record<AmountOperator, string> = {
  equal: "==",
  notEqual: "!=",
  lessThan: "<",
  lessThanOrEqual: "<=",
  greaterThan: ">",
  greaterThanOrEqual: ">=",
};
const JSONLOGIC_TO_OP: Record<string, AmountOperator> = Object.fromEntries(
  Object.entries(OP_TO_JSONLOGIC).map(([op, key]) => [
    key,
    op as AmountOperator,
  ]),
);

// The JSONLogic left-hand side a subject compiles to: the bare prefixed var for
// a field, or the `age` op applied to it for a derived age.
function compileSubject(subject: AmountSubject): Record<string, unknown> {
  const variable = { var: VALUES_PREFIX + subject.path };
  return subject.kind === "age" ? { age: [variable] } : variable;
}

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
      [OP_TO_JSONLOGIC[rule.operator]]: [
        compileSubject(rule.subject),
        rule.value,
      ],
    });
    chain.push(rule.amount);
  }
  chain.push(conditional.default);
  return { if: chain };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// Decompile a `values.`-prefixed `{ var }` to a bare path, or null if it isn't
// that exact shape.
function parseVarPath(node: unknown): string | null {
  if (!isPlainObject(node)) return null;
  if (Object.keys(node).length !== 1 || typeof node.var !== "string")
    return null;
  if (!node.var.startsWith(VALUES_PREFIX)) return null;
  return node.var.slice(VALUES_PREFIX.length);
}

// Decompile the left-hand side to a subject: a bare var → field, or `age` over a
// var → age. Anything else (other ops, missing prefix) → null.
function parseSubject(lhs: unknown): AmountSubject | null {
  const fieldPath = parseVarPath(lhs);
  if (fieldPath !== null) return { kind: "field", path: fieldPath };

  if (isPlainObject(lhs) && Object.keys(lhs).length === 1 && "age" in lhs) {
    const operands = lhs.age;
    if (!Array.isArray(operands) || operands.length !== 1) return null;
    const agePath = parseVarPath(operands[0]);
    if (agePath !== null) return { kind: "age", path: agePath };
  }
  return null;
}

// Decompile one `{ op: [lhs, value] }` condition, or null if it isn't a shape
// this editor emits (unknown op, unrecognized subject, non-literal comparison).
function parseCondition(cond: unknown): Omit<AmountRule, "amount"> | null {
  if (!isPlainObject(cond)) return null;
  const keys = Object.keys(cond);
  if (keys.length !== 1) return null;
  const operator = JSONLOGIC_TO_OP[keys[0]];
  if (!operator) return null;

  const operands = cond[keys[0]];
  if (!Array.isArray(operands) || operands.length !== 2) return null;
  const [lhs, rhs] = operands;

  const subject = parseSubject(lhs);
  if (!subject) return null;
  if (typeof rhs !== "string" && typeof rhs !== "number") return null;

  return { subject, operator, value: rhs };
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
