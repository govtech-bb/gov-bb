import { compileAmount, parseAmount } from "./-amount-rule";
import type { ConditionalAmount } from "./-amount-rule";

describe("compileAmount", () => {
  it("compiles a single equality rule to an if-chain ending in the default", () => {
    const conditional: ConditionalAmount = {
      rules: [
        {
          field: "applicant-details.nationality",
          operator: "notEqual",
          value: "national",
          amount: 20,
        },
      ],
      default: 10,
    };
    expect(compileAmount(conditional)).toEqual({
      if: [
        { "!=": [{ var: "applicant-details.nationality" }, "national"] },
        20,
        10,
      ],
    });
  });

  it("maps `equal` to `==`", () => {
    const conditional: ConditionalAmount = {
      rules: [{ field: "a.b", operator: "equal", value: "x", amount: 5 }],
      default: 0,
    };
    expect(compileAmount(conditional)).toEqual({
      if: [{ "==": [{ var: "a.b" }, "x"] }, 5, 0],
    });
  });

  it("chains multiple rules in order, default last", () => {
    const conditional: ConditionalAmount = {
      rules: [
        { field: "a.b", operator: "equal", value: "x", amount: 1 },
        { field: "c.d", operator: "notEqual", value: "y", amount: 2 },
      ],
      default: 9,
    };
    expect(compileAmount(conditional)).toEqual({
      if: [
        { "==": [{ var: "a.b" }, "x"] },
        1,
        { "!=": [{ var: "c.d" }, "y"] },
        2,
        9,
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

  it("decompiles our if-chain shape back to a conditional table", () => {
    const value = {
      if: [
        { "!=": [{ var: "applicant-details.nationality" }, "national"] },
        20,
        10,
      ],
    };
    expect(parseAmount(value)).toEqual({
      kind: "conditional",
      conditional: {
        rules: [
          {
            field: "applicant-details.nationality",
            operator: "notEqual",
            value: "national",
            amount: 20,
          },
        ],
        default: 10,
      },
    });
  });

  it("decompiles a multi-rule if-chain", () => {
    const value = {
      if: [
        { "==": [{ var: "a.b" }, "x"] },
        1,
        { "!=": [{ var: "c.d" }, "y"] },
        2,
        9,
      ],
    };
    expect(parseAmount(value)).toEqual({
      kind: "conditional",
      conditional: {
        rules: [
          { field: "a.b", operator: "equal", value: "x", amount: 1 },
          { field: "c.d", operator: "notEqual", value: "y", amount: 2 },
        ],
        default: 9,
      },
    });
  });

  it("falls back to advanced for an unrecognized expression object", () => {
    const value = { age: [{ var: "applicant.dob" }] };
    expect(parseAmount(value)).toEqual({ kind: "advanced", raw: value });
  });

  it("falls back to advanced when an operator is outside equal/notEqual", () => {
    const value = { if: [{ ">": [{ var: "a.b" }, 5] }, 1, 0] };
    expect(parseAmount(value)).toEqual({ kind: "advanced", raw: value });
  });

  it("falls back to advanced for a malformed (even-length) if array", () => {
    const value = { if: [{ "==": [{ var: "a.b" }, "x"] }, 1] };
    expect(parseAmount(value)).toEqual({ kind: "advanced", raw: value });
  });

  it("falls back to advanced when a comparison value is not a string", () => {
    // Our editor only ever emits string comparison values; a numeric one is
    // someone else's expression, so we must not claim it round-trips.
    const value = { if: [{ "==": [{ var: "a.b" }, 5] }, 1, 0] };
    expect(parseAmount(value)).toEqual({ kind: "advanced", raw: value });
  });

  it("falls back to advanced when an amount in the chain is not a number", () => {
    const value = {
      if: [{ "==": [{ var: "a.b" }, "x"] }, { var: "fee" }, 0],
    };
    expect(parseAmount(value)).toEqual({ kind: "advanced", raw: value });
  });
});

describe("round-trip", () => {
  it("compile then parse returns an equivalent conditional table", () => {
    const conditional: ConditionalAmount = {
      rules: [
        { field: "a.b", operator: "equal", value: "x", amount: 1 },
        { field: "c.d", operator: "notEqual", value: "y", amount: 2 },
      ],
      default: 9,
    };
    const compiled = compileAmount(conditional);
    expect(parseAmount(compiled)).toEqual({ kind: "conditional", conditional });
  });
});
