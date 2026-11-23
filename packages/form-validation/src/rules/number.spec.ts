import {
  minRunner,
  maxRunner,
  gtRunner,
  ltRunner,
  equalRunner,
  notEqualRunner,
} from "./number";
import { DEFAULT_ZONE } from "@govtech-bb/expressions";

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

// A date exactly `days` from today, as the { day, month, year } object a date
// field stores — so the derived lead time is deterministic regardless of run
// date (or the time of day the test runs).
// Anchored on the Barbados calendar day, because that is what `daysUntil`
// measures from. `new Date()` would anchor on the runner's zone instead: CI
// runs in UTC, where just after midnight it is already tomorrow in UTC but
// still today in Barbados, so every offset came out a day short.
const dateDaysAhead = (
  days: number,
): { day: number; month: number; year: number } => {
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: DEFAULT_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const d = new Date(`${today}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return {
    day: d.getUTCDate(),
    month: d.getUTCMonth() + 1,
    year: d.getUTCFullYear(),
  };
};

describe("minRunner with transform: daysUntil (lead-time gate)", () => {
  it("accepts a start date exactly 14 days ahead", () => {
    expect(
      minRunner(
        dateDaysAhead(14),
        { value: 14, transform: "daysUntil", error: "Apply 14 days ahead" },
        {},
      ),
    ).toBeNull();
  });

  it("rejects a start date fewer than 14 days ahead", () => {
    expect(
      minRunner(
        dateDaysAhead(13),
        { value: 14, transform: "daysUntil", error: "Apply 14 days ahead" },
        {},
      ),
    ).toBe("Apply 14 days ahead");
  });

  it("rejects a start date in the past", () => {
    expect(
      minRunner(
        dateDaysAhead(-1),
        { value: 14, transform: "daysUntil", error: "Apply 14 days ahead" },
        {},
      ),
    ).toBe("Apply 14 days ahead");
  });

  it("an empty/invalid date fails (NaN never satisfies the bound)", () => {
    expect(
      minRunner("", { value: 14, transform: "daysUntil", error: "e" }, {}),
    ).toBe("e");
  });
});

// ─── scaleBy: scale the value by a factor another answer picks (#3636) ───

describe("numeric runners with scaleBy", () => {
  // A monthly income limit, checked against an amount the applicant gets
  // weekly, twice a month or monthly.
  const scaleBy = {
    referenceFieldId: "income-frequency",
    factors: { weekly: 4, "twice-a-month": 2, monthly: 1 },
  };
  const answers = (frequency: unknown) => ({
    income: { "income-frequency": frequency },
  });

  it("max fails when the scaled value is over the bound (weekly × 4)", () => {
    expect(
      maxRunner(
        1000,
        { value: 3000, scaleBy, error: "Over" },
        answers("weekly"),
      ),
    ).toBe("Over");
  });

  it("max passes when the scaled value is within the bound (weekly × 4)", () => {
    expect(
      maxRunner(700, { value: 3000, scaleBy }, answers("weekly")),
    ).toBeNull();
  });

  it("max applies the factor for the answer given", () => {
    expect(
      maxRunner(2000, { value: 3000, scaleBy }, answers("twice-a-month")),
    ).toBe("Must be at most 3000");
    expect(
      maxRunner(2000, { value: 3000, scaleBy }, answers("monthly")),
    ).toBeNull();
  });

  it("min fails when the scaled value is under the bound", () => {
    expect(
      minRunner(
        200,
        { value: 1000, scaleBy, error: "Under" },
        answers("weekly"),
      ),
    ).toBe("Under");
  });

  it("min passes when the scaled value reaches the bound", () => {
    expect(
      minRunner(250, { value: 1000, scaleBy }, answers("weekly")),
    ).toBeNull();
  });

  it("gt compares the scaled value", () => {
    expect(gtRunner(750, { value: 3000, scaleBy }, answers("weekly"))).toBe(
      "Must be greater than 3000",
    );
    expect(
      gtRunner(751, { value: 3000, scaleBy }, answers("weekly")),
    ).toBeNull();
  });

  it("lt compares the scaled value", () => {
    expect(ltRunner(750, { value: 3000, scaleBy }, answers("weekly"))).toBe(
      "Must be less than 3000",
    );
    expect(
      ltRunner(749, { value: 3000, scaleBy }, answers("weekly")),
    ).toBeNull();
  });

  // Each bound fails 1,000,000 both unscaled and scaled, so a null result can
  // only mean the rule was skipped.
  const failingBounds = [
    ["min", minRunner, 2_000_000],
    ["max", maxRunner, -1],
    ["gt", gtRunner, 2_000_000],
    ["lt", ltRunner, -1],
  ] as const;

  it.each(failingBounds)(
    "%s is skipped when the referenced answer is empty or missing",
    (_, runner, bound) => {
      const config = { value: bound, scaleBy };
      expect(runner(1_000_000, config, answers(""))).toBeNull();
      expect(runner(1_000_000, config, answers(undefined))).toBeNull();
      expect(runner(1_000_000, config, answers(null))).toBeNull();
      expect(runner(1_000_000, config, answers([]))).toBeNull();
      expect(runner(1_000_000, config, {})).toBeNull();
    },
  );

  it.each([
    ["min", minRunner, 0],
    ["max", maxRunner, 1_000_000_000],
    ["gt", gtRunner, 0],
    ["lt", ltRunner, 1_000_000_000],
  ] as const)(
    "%s fails when the referenced answer has no factor",
    (_, runner, bound) => {
      // The bound passes unscaled; the rule fails closed all the same.
      const config = { value: bound, scaleBy, error: "No factor" };
      expect(runner(1000, config, answers("yearly"))).toBe("No factor");
    },
  );

  it.each(["__proto__", "constructor", "toString", "hasOwnProperty"])(
    "fails on an inherited object key (%s), not a factor",
    (answer) => {
      expect(
        maxRunner(
          1,
          { value: 3000, scaleBy, error: "No factor" },
          answers(answer),
        ),
      ).toBe("No factor");
    },
  );

  it("fails when the factor is not a finite number", () => {
    const config = {
      value: 3000,
      error: "No factor",
      scaleBy: { ...scaleBy, factors: { weekly: Number.NaN } },
    };
    expect(maxRunner(1, config, answers("weekly"))).toBe("No factor");
  });

  it("reads the reference from the step named by targetStepId", () => {
    const config = {
      value: 3000,
      scaleBy: { ...scaleBy, targetStepId: "income" },
    };
    const allValues = {
      income: { "income-frequency": "weekly" },
      other: { "income-frequency": "monthly" },
    };
    expect(maxRunner(1000, config, allValues)).toBe("Must be at most 3000");
  });

  it("reads a same-step reference from the step values", () => {
    expect(
      maxRunner(
        1000,
        { value: 3000, scaleBy },
        {},
        {
          "income-frequency": "weekly",
        },
      ),
    ).toBe("Must be at most 3000");
  });

  it("scales the transformed number, not the raw date", () => {
    // A 10-year-old's age × 2 = 20 clears `min: 16`; unscaled it would not.
    const scaleByTwo = { referenceFieldId: "count", factors: { two: 2 } };
    const config = { value: 16, transform: "yearsSince" as const };
    const allValues = { s: { count: "two" } };
    expect(minRunner(dobYearsAgo(10), config, allValues)).not.toBeNull();
    expect(
      minRunner(dobYearsAgo(10), { ...config, scaleBy: scaleByTwo }, allValues),
    ).toBeNull();
  });

  it("leaves a rule with no scaleBy unscaled", () => {
    expect(maxRunner(1000, { value: 3000 }, answers("weekly"))).toBeNull();
  });
});
