// Legacy formula syntax supports numbers, quoted strings, {{field}} references, arithmetic,
// parentheses and unary minus. Native calculated values use structured expressions.

export type TokenType =
  | "NUMBER"
  | "STRING"
  | "FIELD_REF"
  | "PLUS"
  | "MINUS"
  | "MULTIPLY"
  | "DIVIDE"
  | "LPAREN"
  | "RPAREN"
  | "EOF";

export type Token = { type: TokenType; value: string };

export type FormulaNode =
  | { type: "NumberLiteral"; value: string }
  | { type: "StringLiteral"; value: string }
  | { type: "FieldReference"; field: string }
  | { type: "UnaryExpression"; operator: "-"; operand: FormulaNode }
  | {
      type: "BinaryExpression";
      operator: "+" | "-" | "*" | "/";
      left: FormulaNode;
      right: FormulaNode;
    };

/**
 * `at` is what the editor underlines: a token's index in tokenizeFormula's output (the end of the formula counts
 * as one past the last), or [start, end) characters when the text doesn't tokenize.
 */
export type FormulaError = { error: string; at: number | [start: number, end: number] };

export const formulaErrors = {
  UNEXPECTED_CHARACTER: "Unexpected character",
  UNTERMINATED_STRING: "Unterminated string",
  EXPECTED_CLOSING_PAREN: "Unmatched parenthesis — expected closing )",
  UNEXPECTED_TOKEN: "Incomplete expression",
  TRAILING_TOKEN: "Unexpected end of expression",
  TOO_DEEP: "Expression too deeply nested",
  TEXT_ONLY_CONCAT: "Text formulas can only use +",
  TYPE_MISMATCH: "Number calculated fields don't support text",
};

// Calculated values use block:field keys; ordinary answer references use a single field key.
const ref = "\\{\\{([\\w-]+(?::[\\w-]+)?)\\}\\}";

const refAtStart = new RegExp(`^${ref}`);

/** Reference-token syntax; use formulaReferences for references outside quoted strings. */
export const fieldRefs = new RegExp(ref, "g");

/** Scan references without parsing or normalizing the surrounding, possibly unfinished formula. */
export function formulaReferences(
  expression: string,
): { field: string; start: number; end: number }[] {
  const references: { field: string; start: number; end: number }[] = [];

  for (let i = 0; i < expression.length;) {
    if (expression[i] === '"' || expression[i] === "'") {
      const quote = expression[i++]!;

      while (i < expression.length) {
        const character = expression[i++]!;

        if (character === "\\") i = Math.min(i + 1, expression.length);
        else if (character === quote) break;
      }

      continue;
    }

    const match = refAtStart.exec(expression.slice(i));

    if (match) {
      references.push({ field: match[1]!, start: i, end: i + match[0].length });
      i += match[0].length;
    } else i++;
  }

  return references;
}

/** Replace reference tokens only; retain all other bytes, including escaped/unfinished strings. */
export function mapFormulaReferences(expression: string, map: (field: string) => string): string {
  let result = "",
    end = 0;

  for (const reference of formulaReferences(expression)) {
    result += expression.slice(end, reference.start) + `{{${map(reference.field)}}}`;
    end = reference.end;
  }

  return result + expression.slice(end);
}

export const operators = {
  "+": "PLUS",
  "-": "MINUS",
  "*": "MULTIPLY",
  "/": "DIVIDE",
  "(": "LPAREN",
  ")": "RPAREN",
} satisfies Record<string, TokenType>;

export const operatorType = (symbol: string) =>
  Object.entries(operators).find(([candidate]) => candidate === symbol)?.[1];

class Failure {
  constructor(
    readonly error: string,
    readonly at: FormulaError["at"],
  ) {}
}

const startsToken = (s: string, i: number) =>
  /[0-9]/.test(s[i]!) ||
  (s[i] === "." && /[0-9]/.test(s[i + 1] ?? "")) ||
  s[i] === '"' ||
  s[i] === "'" ||
  s[i]! in operators ||
  refAtStart.test(s.slice(i));

function tokens(s: string): Token[] {
  const out: Token[] = [];

  for (let i = 0; i < s.length;) {
    if (/\s/.test(s[i]!)) {
      i++;
      continue;
    }

    if (s[i] === '"' || s[i] === "'") {
      const quote = s[i]!;
      const start = i++;
      let value = "";

      for (; i < s.length && s[i] !== quote; i++) {
        if (s[i] === "\\" && i + 1 < s.length) i++;
        value += s[i];
      }

      if (i >= s.length) throw new Failure(formulaErrors.UNTERMINATED_STRING, [start, s.length]);
      i++;
      out.push({ type: "STRING", value });
      continue;
    }

    const field = refAtStart.exec(s.slice(i));

    if (field) {
      out.push({ type: "FIELD_REF", value: field[1]! });
      i += field[0].length;
      continue;
    }

    const number = /^(?:[0-9]+(?:\.[0-9]*)?|\.[0-9]+)/.exec(s.slice(i));

    if (number) {
      out.push({ type: "NUMBER", value: number[0] });
      i += number[0].length;
      continue;
    }

    const operator = operatorType(s[i]!);

    if (operator) {
      out.push({ type: operator, value: s[i++]! });
      continue;
    }

    // The run of characters up to the next space or token is what's underlined
    let end = i;

    while (end < s.length && !/\s/.test(s[end]!) && !startsToken(s, end)) end++;
    throw new Failure(formulaErrors.UNEXPECTED_CHARACTER, [i, end]);
  }

  out.push({ type: "EOF", value: "" });

  return out;
}

/** The tokens without the end marker, or null when the text doesn't tokenize. */
export function tokenizeFormula(expression: string): Token[] | null {
  try {
    return tokens(expression).filter((t) => t.type !== "EOF");
  } catch {
    return null;
  }
}

export const quote = (value: string) => `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;

export const formulaText = (list: Token[]) =>
  list
    .map((t) =>
      t.type === "STRING" ? quote(t.value) : t.type === "FIELD_REF" ? `{{${t.value}}}` : t.value,
    )
    .join(" ");

// Nesting counts both groups and unary minus to bound recursive parsing.
const maxDepth = 500;

function parse(list: Token[]): FormulaNode {
  let at = 0;
  let depth = 0;
  const peek = () => list[at]!;

  // A depth-limit failure points to the last token because there is no single offending operator.
  const deeper = () => {
    if (++depth > maxDepth) throw new Failure(formulaErrors.TOO_DEEP, list.length - 2);
  };

  const sum = (): FormulaNode => {
    deeper();
    let left = product();

    while (peek().type === "PLUS" || peek().type === "MINUS") {
      const operator = list[at++]!.type === "PLUS" ? "+" : "-";
      left = { type: "BinaryExpression", operator, left, right: product() };
    }

    depth--;

    return left;
  };

  const product = (): FormulaNode => {
    let left = unary();

    while (peek().type === "MULTIPLY" || peek().type === "DIVIDE") {
      const operator = list[at++]!.type === "MULTIPLY" ? "*" : "/";
      left = { type: "BinaryExpression", operator, left, right: unary() };
    }

    return left;
  };

  const unary = (): FormulaNode => {
    if (peek().type !== "MINUS") return primary();
    deeper();
    at++;
    const operand = unary();
    depth--;

    return { type: "UnaryExpression", operator: "-", operand };
  };

  const primary = (): FormulaNode => {
    const token = peek();

    if (token.type === "NUMBER" || token.type === "STRING") {
      at++;

      return {
        type: token.type === "NUMBER" ? "NumberLiteral" : "StringLiteral",
        value: token.value,
      };
    }

    if (token.type === "FIELD_REF") {
      at++;

      return { type: "FieldReference", field: token.value };
    }

    if (token.type === "LPAREN") {
      const open = at++;
      const inner = sum();

      if (peek().type !== "RPAREN") throw new Failure(formulaErrors.EXPECTED_CLOSING_PAREN, open);
      at++;

      return inner;
    }

    throw new Failure(formulaErrors.UNEXPECTED_TOKEN, at);
  };

  const ast = sum();

  if (peek().type !== "EOF") throw new Failure(formulaErrors.TRAILING_TOKEN, at);

  return ast;
}

// Text formulas only join: any unary minus or other operator is an error
const joinsOnly = (node: FormulaNode): boolean =>
  node.type === "UnaryExpression"
    ? false
    : node.type === "BinaryExpression"
      ? node.operator === "+" && joinsOnly(node.left) && joinsOnly(node.right)
      : true;

/** Parse the expression and, when a value type is supplied, enforce numeric arithmetic or text concatenation. */
export function parseFormula(
  expression: string,
  type?: "NUMBER" | "TEXT",
): { ast: FormulaNode } | FormulaError {
  try {
    const list = tokens(expression);
    const ast = parse(list);

    if (type === "TEXT" && !joinsOnly(ast))
      return {
        error: formulaErrors.TEXT_ONLY_CONCAT,
        at: list.findIndex(
          (t) => t.type === "MINUS" || t.type === "MULTIPLY" || t.type === "DIVIDE",
        ),
      };

    if (type === "NUMBER" && list.some((t) => t.type === "STRING"))
      return { error: formulaErrors.TYPE_MISMATCH, at: list.findIndex((t) => t.type === "STRING") };

    return { ast };
  } catch (e) {
    if (e instanceof Failure) return { error: e.error, at: e.at };
    throw e;
  }
}
