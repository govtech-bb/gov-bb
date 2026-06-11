import {
  minRunner,
  maxRunner,
  gtRunner,
  ltRunner,
  equalRunner,
  notEqualRunner,
} from "./number";

const cfg = (
  value?: unknown,
  error?: string,
  referenceFieldId?: string,
  targetStepId?: string,
) => ({
  value,
  error,
  referenceFieldId,
  targetStepId,
});

describe("minRunner", () => {
  it("passes when value >= min", () => {
    expect(minRunner(5, cfg(5), {})).toBeNull();
  });

  it("fails when value < min", () => {
    expect(minRunner(3, cfg(5), {})).toBe("Must be at least 5");
  });

  it("uses custom error", () => {
    expect(minRunner(3, cfg(5, "Too small"), {})).toBe("Too small");
  });
});

describe("maxRunner", () => {
  it("passes when value <= max", () => {
    expect(maxRunner(5, cfg(5), {})).toBeNull();
  });

  it("fails when value > max", () => {
    expect(maxRunner(10, cfg(5), {})).toBe("Must be at most 5");
  });

  it("uses custom error", () => {
    expect(maxRunner(10, cfg(5, "Too large"), {})).toBe("Too large");
  });
});

describe("gtRunner", () => {
  it("passes when value > config.value", () => {
    expect(gtRunner(6, cfg(5), {})).toBeNull();
  });

  it("fails when value <= config.value", () => {
    expect(gtRunner(5, cfg(5), {})).toBe("Must be greater than 5");
  });

  it("uses referenced field via flat fallback", () => {
    expect(
      gtRunner(10, cfg(undefined, undefined, "minAge"), {
        "step-1": { minAge: 5 },
      }),
    ).toBeNull();
  });

  it("uses referenced field scoped to targetStepId", () => {
    expect(
      gtRunner(10, cfg(undefined, undefined, "minAge", "step-1"), {
        "step-1": { minAge: 5 },
        "step-2": { minAge: 999 },
      }),
    ).toBeNull();
  });

  it("skips when reference is missing from allValues", () => {
    expect(gtRunner(1, cfg(undefined, undefined, "minAge"), {})).toBeNull();
  });

  it("uses custom error", () => {
    expect(gtRunner(5, cfg(5, "Must be greater"), {})).toBe("Must be greater");
  });

  it("returns an error when referenced field value is a non-numeric string", () => {
    const result = gtRunner(10, cfg(undefined, undefined, "minAge"), {
      "step-1": { minAge: "not-a-number" },
    });
    expect(result).not.toBeNull();
  });
});

describe("ltRunner", () => {
  it("passes when value < config.value", () => {
    expect(ltRunner(4, cfg(5), {})).toBeNull();
  });

  it("fails when value >= config.value", () => {
    expect(ltRunner(5, cfg(5), {})).toBe("Must be less than 5");
  });

  it("skips when reference is missing", () => {
    expect(ltRunner(100, cfg(undefined, undefined, "maxAge"), {})).toBeNull();
  });

  it("fails when value >= config.value with no referenceFieldId (MISSING path)", () => {
    expect(ltRunner(10, cfg(5), {})).toBe("Must be less than 5");
  });

  it("passes when value < config.value with no referenceFieldId (MISSING path)", () => {
    expect(ltRunner(3, cfg(5), {})).toBeNull();
  });

  it("uses referenced field via flat fallback", () => {
    expect(
      ltRunner(3, cfg(undefined, undefined, "maxAge"), {
        "step-1": { maxAge: 5 },
      }),
    ).toBeNull();
  });

  it("fails when value >= resolved reference field", () => {
    expect(
      ltRunner(10, cfg(undefined, undefined, "maxAge"), {
        "step-1": { maxAge: 5 },
      }),
    ).toBe("Must be less than maxAge");
  });
});

describe("equalRunner", () => {
  it("passes when numbers are equal", () => {
    expect(equalRunner(42, cfg(42), {})).toBeNull();
  });

  it("fails when numbers differ", () => {
    expect(equalRunner(1, cfg(42), {})).toBe("Must equal 42");
  });

  it("uses referenced field via flat fallback", () => {
    expect(
      equalRunner(5, cfg(undefined, undefined, "qty"), {
        "step-1": { qty: 5 },
      }),
    ).toBeNull();
  });

  it("uses referenced field scoped to targetStepId", () => {
    expect(
      equalRunner(5, cfg(undefined, undefined, "qty", "step-1"), {
        "step-1": { qty: 5 },
        "step-2": { qty: 99 },
      }),
    ).toBeNull();
  });

  it("skips when reference missing", () => {
    expect(equalRunner(1, cfg(undefined, undefined, "qty"), {})).toBeNull();
  });

  it("passes for case-insensitive text equality", () => {
    expect(equalRunner("Yes", cfg("yes"), {})).toBeNull();
  });

  it("fails when text values differ", () => {
    expect(equalRunner("yes", cfg("no"), {})).toBe("Must equal no");
  });

  it("matches a referenced text field", () => {
    expect(
      equalRunner("Barbados", cfg(undefined, undefined, "country"), {
        "step-1": { country: "barbados" },
      }),
    ).toBeNull();
  });
});

describe("notEqualRunner", () => {
  it("passes when numbers differ", () => {
    expect(notEqualRunner(1, cfg(42), {})).toBeNull();
  });

  it("fails when numbers are equal", () => {
    expect(notEqualRunner(42, cfg(42), {})).toBe("Must not equal 42");
  });

  it("uses referenced field via flat fallback", () => {
    expect(
      notEqualRunner(5, cfg(undefined, undefined, "qty"), {
        "step-1": { qty: 10 },
      }),
    ).toBeNull();
  });

  it("skips when reference missing", () => {
    expect(notEqualRunner(1, cfg(undefined, undefined, "qty"), {})).toBeNull();
  });

  it("passes when text values differ", () => {
    expect(notEqualRunner("yes", cfg("no"), {})).toBeNull();
  });

  it("fails for case-insensitive text equality", () => {
    expect(notEqualRunner("Yes", cfg("yes"), {})).toBe("Must not equal yes");
  });
});

// ─── transform: derive a number from a date before comparing (issue #1020) ───

// A DOB exactly `years` ago, as the { day, month, year } object a date field
// stores — the derived age is then deterministic regardless of run date.
const dobYearsAgo = (
  years: number,
): { day: number; month: number; year: number } => {
  const d = new Date();
  d.setFullYear(d.getFullYear() - years);
  return { day: d.getDate(), month: d.getMonth() + 1, year: d.getFullYear() };
};

describe("numeric runners with transform: yearsSince", () => {
  it("minRunner: derives age from a DOB and enforces the lower bound", () => {
    expect(
      minRunner(dobYearsAgo(20), { value: 16, transform: "yearsSince" }, {}),
    ).toBeNull();
    expect(
      minRunner(dobYearsAgo(10), { value: 16, transform: "yearsSince" }, {}),
    ).toBe("Must be at least 16");
  });

  it("maxRunner: an out-of-range DOB (e.g. 1903) fails the upper bound (#992)", () => {
    expect(
      maxRunner(
        { day: 1, month: 1, year: 1903 },
        { value: 24, transform: "yearsSince" },
        {},
      ),
    ).toBe("Must be at most 24");
    expect(
      maxRunner(dobYearsAgo(20), { value: 24, transform: "yearsSince" }, {}),
    ).toBeNull();
  });

  it("min + max compose to an age window (16–24)", () => {
    const inRange = dobYearsAgo(20);
    expect(
      minRunner(inRange, { value: 16, transform: "yearsSince" }, {}),
    ).toBeNull();
    expect(
      maxRunner(inRange, { value: 24, transform: "yearsSince" }, {}),
    ).toBeNull();
  });

  it("an empty/invalid date under transform fails (NaN never satisfies a bound)", () => {
    expect(maxRunner("", { value: 24, transform: "yearsSince" }, {})).toBe(
      "Must be at most 24",
    );
  });

  it("gtRunner / ltRunner honour the transform", () => {
    expect(
      gtRunner(dobYearsAgo(20), { value: 16, transform: "yearsSince" }, {}),
    ).toBeNull();
    expect(
      gtRunner(dobYearsAgo(10), { value: 16, transform: "yearsSince" }, {}),
    ).toBe("Must be greater than 16");
    expect(
      ltRunner(dobYearsAgo(20), { value: 24, transform: "yearsSince" }, {}),
    ).toBeNull();
    expect(
      ltRunner(dobYearsAgo(30), { value: 24, transform: "yearsSince" }, {}),
    ).toBe("Must be less than 24");
  });
});
