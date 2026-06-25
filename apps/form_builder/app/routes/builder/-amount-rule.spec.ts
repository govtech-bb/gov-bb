import { compileAmount, parseAmount } from "./-amount-rule";
import type { ConditionalAmount } from "./-amount-rule";

describe("compileAmount — subject and operators", () => {
  it("compiles a field-value equality rule, prefixing the var with `values.`", () => {
    const conditional: ConditionalAmount = {
      rules: [
        {
          subject: { kind: "field", path: "applicant.nationality" },
          operator: "notEqual",
          value: "national",
          amount: 20,
        },
      ],
      default: 10,
    };
    expect(compileAmount(conditional)).toEqual({
      if: [
        { "!=": [{ var: "values.applicant.nationality" }, "national"] },
        20,
        10,
      ],
    });
  });

  it("compiles an `age of field` rule to the `age` op over the prefixed var", () => {
    const conditional: ConditionalAmount = {
      rules: [
        {
          subject: { kind: "age", path: "applicant.dob" },
          operator: "greaterThanOrEqual",
          value: 60,
          amount: 0,
        },
      ],
      default: 25,
    };
    expect(compileAmount(conditional)).toEqual({
      if: [{ ">=": [{ age: [{ var: "values.applicant.dob" }] }, 60] }, 0, 25],
    });
  });

  it("maps every operator to its JSONLogic key", () => {
    const ops = [
      ["equal", "=="],
      ["notEqual", "!="],
      ["lessThan", "<"],
      ["lessThanOrEqual", "<="],
      ["greaterThan", ">"],
      ["greaterThanOrEqual", ">="],
    ] as const;
    for (const [operator, key] of ops) {
      const compiled = compileAmount({
        rules: [
          {
            subject: { kind: "field", path: "a.b" },
            operator,
            value: 1,
            amount: 5,
          },
        ],
        default: 0,
      });
      expect(compiled).toEqual({
        if: [{ [key]: [{ var: "values.a.b" }, 1] }, 5, 0],
      });
    }
  });

  it("chains age bands in order, first match wins, default last", () => {
    const conditional: ConditionalAmount = {
      rules: [
        {
          subject: { kind: "age", path: "applicant.dob" },
          operator: "lessThan",
          value: 16,
          amount: 5,
        },
        {
          subject: { kind: "age", path: "applicant.dob" },
          operator: "lessThan",
          value: 66,
          amount: 10,
        },
      ],
      default: 20,
    };
    expect(compileAmount(conditional)).toEqual({
      if: [
        { "<": [{ age: [{ var: "values.applicant.dob" }] }, 16] },
        5,
        { "<": [{ age: [{ var: "values.applicant.dob" }] }, 66] },
        10,
        20,
      ],
    });
  });

  it("collapses an empty rule list to a bare default number", () => {
    expect(compileAmount({ rules: [], default: 15 })).toBe(15);
  });
});

describe("parseAmount", () => {
  it("treats a plain number as a fixed amount", () => {
    expect(parseAmount(10)).toEqual({ kind: "fixed", amount: 10 });
  });

  it("treats undefined (unset) as a fixed amount with no value", () => {
    expect(parseAmount(undefined)).toEqual({
      kind: "fixed",
      amount: undefined,
    });
  });

  it("decompiles a field-value if-chain, stripping the `values.` prefix", () => {
    const value = {
      if: [
        { "!=": [{ var: "values.applicant.nationality" }, "national"] },
        20,
        10,
      ],
    };
    expect(parseAmount(value)).toEqual({
      kind: "conditional",
      conditional: {
        rules: [
          {
            subject: { kind: "field", path: "applicant.nationality" },
            operator: "notEqual",
            value: "national",
            amount: 20,
          },
        ],
        default: 10,
      },
    });
  });

  it("decompiles an `age` if-chain back to an age subject", () => {
    const value = {
      if: [{ ">=": [{ age: [{ var: "values.applicant.dob" }] }, 60] }, 0, 25],
    };
    expect(parseAmount(value)).toEqual({
      kind: "conditional",
      conditional: {
        rules: [
          {
            subject: { kind: "age", path: "applicant.dob" },
            operator: "greaterThanOrEqual",
            value: 60,
            amount: 0,
          },
        ],
        default: 25,
      },
    });
  });

  it("falls back to advanced for an unrecognized operator (e.g. `in`)", () => {
    const value = {
      if: [{ in: [{ var: "values.a.b" }, ["x"]] }, 1, 0],
    };
    expect(parseAmount(value)).toEqual({ kind: "advanced", raw: value });
  });

  it("falls back to advanced for a var missing the `values.` prefix", () => {
    // The pre-fix equality-slice shape; we don't recognize it, so it shows
    // read-only rather than being silently re-prefixed.
    const value = { if: [{ "==": [{ var: "applicant.x" }, "y"] }, 1, 0] };
    expect(parseAmount(value)).toEqual({ kind: "advanced", raw: value });
  });

  it("falls back to advanced for a malformed `age` lhs", () => {
    const value = {
      if: [{ ">=": [{ age: { var: "values.a.b" } }, 60] }, 0, 1],
    };
    expect(parseAmount(value)).toEqual({ kind: "advanced", raw: value });
  });

  it("falls back to advanced for a malformed (even-length) if array", () => {
    const value = { if: [{ "==": [{ var: "values.a.b" }, "x"] }, 1] };
    expect(parseAmount(value)).toEqual({ kind: "advanced", raw: value });
  });

  it("falls back to advanced when an amount in the chain is not a number", () => {
    const value = {
      if: [{ "==": [{ var: "values.a.b" }, "x"] }, { var: "fee" }, 0],
    };
    expect(parseAmount(value)).toEqual({ kind: "advanced", raw: value });
  });
});

describe("round-trip", () => {
  it("round-trips a mixed field + age band table", () => {
    const conditional: ConditionalAmount = {
      rules: [
        {
          subject: { kind: "field", path: "applicant.nationality" },
          operator: "equal",
          value: "diplomat",
          amount: 0,
        },
        {
          subject: { kind: "age", path: "applicant.dob" },
          operator: "lessThan",
          value: 16,
          amount: 5,
        },
      ],
      default: 20,
    };
    expect(parseAmount(compileAmount(conditional))).toEqual({
      kind: "conditional",
      conditional,
    });
  });
});

describe("compileAmount — quantity multiplier", () => {
  it("wraps a fixed (bare-default) base in `{ * : [base, values.qty] }`", () => {
    expect(
      compileAmount(
        { rules: [], default: 15 },
        "order-details.number-of-copies",
      ),
    ).toEqual({
      "*": [15, { var: "values.order-details.number-of-copies" }],
    });
  });

  it("wraps a conditional if-chain base, multiplier outermost", () => {
    const conditional: ConditionalAmount = {
      rules: [
        {
          subject: { kind: "age", path: "applicant.dob" },
          operator: "greaterThanOrEqual",
          value: 60,
          amount: 0,
        },
      ],
      default: 25,
    };
    expect(
      compileAmount(conditional, "order-details.number-of-copies"),
    ).toEqual({
      "*": [
        {
          if: [
            { ">=": [{ age: [{ var: "values.applicant.dob" }] }, 60] },
            0,
            25,
          ],
        },
        { var: "values.order-details.number-of-copies" },
      ],
    });
  });

  it("does not wrap when the quantity path is absent or empty", () => {
    expect(compileAmount({ rules: [], default: 15 })).toBe(15);
    expect(compileAmount({ rules: [], default: 15 }, "")).toBe(15);
    expect(compileAmount({ rules: [], default: 15 }, undefined)).toBe(15);
  });
});

describe("parseAmount — quantity multiplier", () => {
  it("peels a fixed × quantity wrapper, stripping the `values.` prefix", () => {
    const value = {
      "*": [15, { var: "values.order-details.number-of-copies" }],
    };
    expect(parseAmount(value)).toEqual({
      kind: "fixed",
      amount: 15,
      quantityPath: "order-details.number-of-copies",
    });
  });

  it("peels a conditional × quantity wrapper, classifying the inner if-chain", () => {
    const value = {
      "*": [
        {
          if: [
            { ">=": [{ age: [{ var: "values.applicant.dob" }] }, 60] },
            0,
            25,
          ],
        },
        { var: "values.order-details.number-of-copies" },
      ],
    };
    expect(parseAmount(value)).toEqual({
      kind: "conditional",
      conditional: {
        rules: [
          {
            subject: { kind: "age", path: "applicant.dob" },
            operator: "greaterThanOrEqual",
            value: 60,
            amount: 0,
          },
        ],
        default: 25,
      },
      quantityPath: "order-details.number-of-copies",
    });
  });

  it("falls back to advanced (raw = whole expr) when the inner node is unrecognized", () => {
    const value = {
      "*": [
        { if: [{ in: [{ var: "values.a.b" }, ["x"]] }, 1, 0] },
        { var: "values.qty" },
      ],
    };
    expect(parseAmount(value)).toEqual({ kind: "advanced", raw: value });
  });

  it("falls back to advanced when the quantity var lacks the `values.` prefix", () => {
    const value = { "*": [15, { var: "qty" }] };
    expect(parseAmount(value)).toEqual({ kind: "advanced", raw: value });
  });

  it("falls back to advanced when the multiplier is not a single var (e.g. var × var)", () => {
    const value = {
      "*": [{ var: "values.unit-price" }, { var: "values.qty" }],
    };
    expect(parseAmount(value)).toEqual({ kind: "advanced", raw: value });
  });

  it("falls back to advanced for a `*` with the wrong arity", () => {
    const value = { "*": [1, 2, { var: "values.qty" }] };
    expect(parseAmount(value)).toEqual({ kind: "advanced", raw: value });
  });

  it("falls back to advanced for a non-number scalar base (never clobbers it)", () => {
    const value = { "*": ["foo", { var: "values.qty" }] };
    expect(parseAmount(value)).toEqual({ kind: "advanced", raw: value });
  });

  it("falls back to advanced for a null base", () => {
    const value = { "*": [null, { var: "values.qty" }] };
    expect(parseAmount(value)).toEqual({ kind: "advanced", raw: value });
  });

  it("peels a zero unit price (a valid free-per-unit base)", () => {
    const value = { "*": [0, { var: "values.qty" }] };
    expect(parseAmount(value)).toEqual({
      kind: "fixed",
      amount: 0,
      quantityPath: "qty",
    });
  });
});

describe("round-trip — quantity multiplier", () => {
  it("round-trips fixed × quantity", () => {
    const value = compileAmount({ rules: [], default: 15 }, "order.copies");
    expect(parseAmount(value)).toEqual({
      kind: "fixed",
      amount: 15,
      quantityPath: "order.copies",
    });
  });

  it("round-trips conditional × quantity", () => {
    const conditional: ConditionalAmount = {
      rules: [
        {
          subject: { kind: "field", path: "applicant.nationality" },
          operator: "notEqual",
          value: "national",
          amount: 20,
        },
      ],
      default: 10,
    };
    const value = compileAmount(conditional, "order.copies");
    expect(parseAmount(value)).toEqual({
      kind: "conditional",
      conditional,
      quantityPath: "order.copies",
    });
  });
});
