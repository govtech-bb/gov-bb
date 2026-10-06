import { expect, test } from "vitest";
import {
  nativeFormula,
  parseNativeFormula,
} from "../../src/forms/features/calculations/native-formula";
import type { NativeTargets } from "../../src/forms/features/logic/native-authoring";
import type { Expression } from "../../src/forms/schema/types";

const targets: NativeTargets = {
  questions: [{ value: "amount.with spaces", label: "Amount", kind: "number", options: [] }],
  calculated: [{ value: "total", label: "Total", kind: "number" }],
  pages: [],
  visibility: [],
};

test("rendering and unchanged formula text retain nested trees and scopes exactly", () => {
  const value: Expression = {
    op: "divide",
    args: [
      { op: "subtract", args: [10, { op: "subtract", args: [4, 1] }] },
      {
        op: "multiply",
        args: [
          {
            op: "add",
            args: [
              { answer: "amount.with spaces", scope: "current" },
              { answer: "amount.with spaces", scope: "form" },
            ],
          },
          { op: "add", args: [{ value: "total" }, { value: "total", scope: "form" }] },
        ],
      },
    ],
  };

  const before = structuredClone(value);
  const formula = nativeFormula(value, targets)!;

  expect(parseNativeFormula(formula.text, formula)).toEqual({ value });
  expect(parseNativeFormula(`  ${formula.text}  `, formula)).toEqual({ value });
  expect(parseNativeFormula(formula.text, formula)).toHaveProperty("value", value);
  expect(value).toEqual(before);
  expect(formula.references.size).toBe(6);
  expect(formula.fields.map((field) => field.title)).toContain("Amount (same repeated entry)");
  expect(formula.fields.map((field) => field.title)).toContain("Amount (whole form)");
});

test("edited arithmetic preserves grouping, operand order and distinct scoped references", () => {
  const value: Expression = {
    op: "add",
    args: [
      { answer: "amount.with spaces", scope: "current" },
      { value: "total", scope: "form" },
    ],
  };

  const formula = nativeFormula(value, targets)!;
  const question = formula.fields.find((field) => field.title === "Amount (same repeated entry)")!;
  const calculated = formula.fields.find((field) => field.title === "Total (whole form)")!;

  expect(parseNativeFormula(`{{${question.key}}} - ({{${calculated.key}}} / 2)`, formula)).toEqual({
    value: {
      op: "subtract",
      args: [
        { answer: "amount.with spaces", scope: "current" },
        { op: "divide", args: [{ value: "total", scope: "form" }, 2] },
      ],
    },
  });
  expect(nativeFormula(0, targets)!.fields.find((field) => field.title === "Amount")!.key).toBe(
    formula.fields.find((field) => field.title === "Amount")!.key,
  );
});

test("text formulas retain quoted strings and native references without converting literal types", () => {
  const value: Expression = {
    op: "concat",
    args: ['He said "hi". ', { context: "submissionReference" }],
  };

  const formula = nativeFormula(value, targets)!;

  expect(formula.type).toBe("TEXT");
  expect(parseNativeFormula(formula.text, formula)).toEqual({ value });
  expect(parseNativeFormula('"new" + " text"', formula)).toEqual({
    value: { op: "concat", args: ["new", " text"] },
  });
  expect(parseNativeFormula('"7"', formula)).toEqual({ value: "7" });
  expect(parseNativeFormula("7", formula)).toEqual({ value: 7 });
});

test("unsupported native calculations, scopes and values remain available to the structured editor", () => {
  const unsupported: Expression[] = [
    false,
    { op: "add", args: [1, 2, 3] },
    { op: "concat", args: ["a", "b", "c"] },
    "literal {{kept-verbatim}} text",
    { op: "round", args: [1.3], increment: 1, ties: "towardPositiveInfinity" },
    { op: "lookup", args: ["a"], entries: [{ key: "a", value: 2 }], fallback: 0 },
    { op: "daysBetween", args: [{ context: "today" }, "2026-01-01"] },
    { op: "concat", args: ["Total: ", { op: "add", args: [1, 2] }] },
  ];

  for (const value of unsupported) {
    const before = structuredClone(value);

    expect(nativeFormula(value, targets)).toBeNull();
    expect(value).toEqual(before);
  }

  expect(nativeFormula("2026-01-01", targets, "date")).toBeNull();
});

test("incomplete formulas and unknown references cannot replace a native expression", () => {
  const value: Expression = { op: "multiply", args: [{ value: "total", scope: "form" }, 2] };
  const formula = nativeFormula(value, targets)!;

  expect(parseNativeFormula("1 +", formula)).toHaveProperty("error");
  expect(parseNativeFormula("{{not_registered}} + 1", formula)).toHaveProperty("error");
  expect(value).toEqual({ op: "multiply", args: [{ value: "total", scope: "form" }, 2] });
});

test("small and large finite numeric literals remain exactly representable without exponent tokens", () => {
  for (const value of [1e-7, -2.25e-8, 1e21, -0]) {
    const formula = nativeFormula(value, targets)!;

    expect(formula.text).not.toContain("e");
    expect(parseNativeFormula(formula.text, formula)).toEqual({ value });
  }

  expect(parseNativeFormula("-4", nativeFormula(1, targets)!)).toEqual({ value: -4 });
});
