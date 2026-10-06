import { expect, test } from "vitest";
import {
  formulaErrors as e,
  formulaText,
  parseFormula,
  tokenizeFormula,
} from "../../src/forms/core/formula";

test("formulas report parse errors at the token the editor underlines", () => {
  // Precedence, unary minus, groups, strings with escapes, field keys
  expect(parseFormula("-{{a}} + 2 * (3 - .5)")).toEqual({
    ast: {
      type: "BinaryExpression",
      operator: "+",
      left: {
        type: "UnaryExpression",
        operator: "-",
        operand: { type: "FieldReference", field: "a" },
      },
      right: {
        type: "BinaryExpression",
        operator: "*",
        left: { type: "NumberLiteral", value: "2" },
        right: {
          type: "BinaryExpression",
          operator: "-",
          left: { type: "NumberLiteral", value: "3" },
          right: { type: "NumberLiteral", value: ".5" },
        },
      },
    },
  });
  expect(parseFormula(`'it\\'s' + {{b:c}}`, "TEXT")).toEqual({
    ast: {
      type: "BinaryExpression",
      operator: "+",
      left: { type: "StringLiteral", value: "it's" },
      right: { type: "FieldReference", field: "b:c" },
    },
  });
  // Stored as tokens joined by spaces, strings in double quotes
  expect(formulaText(tokenizeFormula(`1+{{a}}*('x"y')`)!)).toBe(`1 + {{a}} * ( "x\\"y" )`);
  expect(tokenizeFormula(`"open`)).toBeNull();

  // Tokenizer errors give characters; parser errors the token
  expect(parseFormula("1 + 2 # 3")).toEqual({ error: e.UNEXPECTED_CHARACTER, at: [6, 7] });
  expect(parseFormula("ab+1")).toEqual({ error: e.UNEXPECTED_CHARACTER, at: [0, 2] });
  expect(parseFormula(`1 + "open`)).toEqual({ error: e.UNTERMINATED_STRING, at: [4, 9] });
  expect(parseFormula("(1 + 2")).toEqual({ error: e.EXPECTED_CLOSING_PAREN, at: 0 });
  expect(parseFormula("1 +")).toEqual({ error: e.UNEXPECTED_TOKEN, at: 2 });
  expect(parseFormula("1 2")).toEqual({ error: e.TRAILING_TOKEN, at: 1 });
  expect(parseFormula(`${"(".repeat(499)}1${")".repeat(499)}`)).toHaveProperty("ast");
  expect(parseFormula(`${"(".repeat(500)}1${")".repeat(500)}`)).toEqual({
    error: e.TOO_DEEP,
    at: 1000,
  });
  expect(parseFormula(`${"-".repeat(500)}1`)).toEqual({ error: e.TOO_DEEP, at: 500 });

  // The builder's type checks
  expect(parseFormula(`"a" + {{x}} * 2`, "TEXT")).toEqual({ error: e.TEXT_ONLY_CONCAT, at: 3 });
  expect(parseFormula(`-"a"`, "TEXT")).toEqual({ error: e.TEXT_ONLY_CONCAT, at: 0 });
  expect(parseFormula(`1 + "a"`, "NUMBER")).toEqual({ error: e.TYPE_MISMATCH, at: 2 });
  expect(parseFormula(`1 + "a"`)).toHaveProperty("ast");
});
