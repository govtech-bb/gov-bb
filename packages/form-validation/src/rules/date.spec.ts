import {
  pastRunner,
  pastOrTodayRunner,
  futureRunner,
  futureOrTodayRunner,
  afterRunner,
  beforeRunner,
  onOrAfterRunner,
  onOrBeforeRunner,
  minYearRunner,
  maxYearRunner,
} from "./date";

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

const past = "2000-01-01";
const future = "2099-12-31";
const todayStr = new Date().toISOString().split("T")[0]!;

describe("pastRunner", () => {
  it("passes for a past date", () => {
    expect(pastRunner(past, cfg(), {})).toBeNull();
  });

  it("fails for a future date", () => {
    expect(pastRunner(future, cfg(), {})).toBe("Date must be in the past");
  });

  it("fails for today", () => {
    expect(pastRunner(todayStr, cfg(), {})).toBe("Date must be in the past");
  });

  it("uses custom error", () => {
    expect(pastRunner(future, cfg(undefined, "Past only"), {})).toBe(
      "Past only",
    );
  });

  it("fails for invalid date string", () => {
    expect(pastRunner("not-a-date", cfg(), {})).toBe(
      "Date must be in the past",
    );
  });
});

describe("pastOrTodayRunner", () => {
  it("passes for a past date", () => {
    expect(pastOrTodayRunner(past, cfg(), {})).toBeNull();
  });

  it("passes for today", () => {
    expect(pastOrTodayRunner(todayStr, cfg(), {})).toBeNull();
  });

  it("fails for a future date", () => {
    expect(pastOrTodayRunner(future, cfg(), {})).toBe(
      "Date must be today or in the past",
    );
  });
});

describe("futureRunner", () => {
  it("passes for a future date", () => {
    expect(futureRunner(future, cfg(), {})).toBeNull();
  });

  it("fails for a past date", () => {
    expect(futureRunner(past, cfg(), {})).toBe("Date must be in the future");
  });

  it("fails for today", () => {
    expect(futureRunner(todayStr, cfg(), {})).toBe(
      "Date must be in the future",
    );
  });
});

describe("futureOrTodayRunner", () => {
  it("passes for a future date", () => {
    expect(futureOrTodayRunner(future, cfg(), {})).toBeNull();
  });

  it("passes for today", () => {
    expect(futureOrTodayRunner(todayStr, cfg(), {})).toBeNull();
  });

  it("fails for a past date", () => {
    expect(futureOrTodayRunner(past, cfg(), {})).toBe(
      "Date must be today or in the future",
    );
  });
});

describe("afterRunner", () => {
  it("passes when date is after reference value", () => {
    expect(afterRunner("2020-06-01", cfg("2020-01-01"), {})).toBeNull();
  });

  it("fails when date equals reference value", () => {
    expect(afterRunner("2020-01-01", cfg("2020-01-01"), {})).toBe(
      "Date must be after 2020-01-01",
    );
  });

  it("uses referenced field via flat fallback", () => {
    expect(
      afterRunner("2020-06-01", cfg(undefined, undefined, "startDate"), {
        "step-1": { startDate: "2020-01-01" },
      }),
    ).toBeNull();
  });

  it("uses referenced field scoped to targetStepId", () => {
    expect(
      afterRunner(
        "2020-06-01",
        cfg(undefined, undefined, "startDate", "step-1"),
        {
          "step-1": { startDate: "2020-01-01" },
          "step-2": { startDate: "2099-01-01" },
        },
      ),
    ).toBeNull();
  });

  it("skips when reference field is missing", () => {
    expect(
      afterRunner("2020-01-01", cfg(undefined, undefined, "startDate"), {}),
    ).toBeNull();
  });

  it("skips when targetStepId step is missing", () => {
    expect(
      afterRunner(
        "2020-01-01",
        cfg(undefined, undefined, "startDate", "step-99"),
        { "step-1": { startDate: "2020-01-01" } },
      ),
    ).toBeNull();
  });

  it("returns an error when referenced field resolves to a non-date string", () => {
    const result = afterRunner(
      "2020-06-01",
      cfg(undefined, undefined, "startDate"),
      { "step-1": { startDate: "not-a-date" } },
    );
    expect(result).not.toBeNull();
  });
});

describe("beforeRunner", () => {
  it("passes when date is before reference value", () => {
    expect(beforeRunner("2020-01-01", cfg("2020-06-01"), {})).toBeNull();
  });

  it("fails when date equals reference value", () => {
    expect(beforeRunner("2020-06-01", cfg("2020-06-01"), {})).toBe(
      "Date must be before 2020-06-01",
    );
  });

  it("skips when reference field is missing", () => {
    expect(
      beforeRunner("2020-06-01", cfg(undefined, undefined, "endDate"), {}),
    ).toBeNull();
  });
});

describe("onOrAfterRunner", () => {
  it("passes when date equals reference", () => {
    expect(onOrAfterRunner("2020-01-01", cfg("2020-01-01"), {})).toBeNull();
  });

  it("passes when date is after reference", () => {
    expect(onOrAfterRunner("2020-06-01", cfg("2020-01-01"), {})).toBeNull();
  });

  it("fails when date is before reference", () => {
    expect(onOrAfterRunner("2019-12-31", cfg("2020-01-01"), {})).toBe(
      "Date must be on or after 2020-01-01",
    );
  });

  it("skips when reference field is missing", () => {
    expect(
      onOrAfterRunner("2020-01-01", cfg(undefined, undefined, "startDate"), {}),
    ).toBeNull();
  });
});

describe("onOrBeforeRunner", () => {
  it("passes when date equals reference", () => {
    expect(onOrBeforeRunner("2020-01-01", cfg("2020-01-01"), {})).toBeNull();
  });

  it("passes when date is before reference", () => {
    expect(onOrBeforeRunner("2019-12-31", cfg("2020-01-01"), {})).toBeNull();
  });

  it("fails when date is after reference", () => {
    expect(onOrBeforeRunner("2020-06-01", cfg("2020-01-01"), {})).toBe(
      "Date must be on or before 2020-01-01",
    );
  });

  it("skips when reference field is missing", () => {
    expect(
      onOrBeforeRunner("2020-06-01", cfg(undefined, undefined, "endDate"), {}),
    ).toBeNull();
  });
});

describe("parseDate — DateValue object format", () => {
  it("accepts a DateValue object in the past", () => {
    expect(pastRunner({ day: 1, month: 1, year: 2000 }, cfg(), {})).toBeNull();
  });

  it("rejects a DateValue object in the future", () => {
    expect(pastRunner({ day: 31, month: 12, year: 2099 }, cfg(), {})).toBe(
      "Date must be in the past",
    );
  });

  it("treats a DateValue with day=0 as invalid", () => {
    expect(pastRunner({ day: 0, month: 1, year: 2000 }, cfg(), {})).toBe(
      "Date must be in the past",
    );
  });

  it("treats a DateValue with month=0 as invalid", () => {
    expect(pastRunner({ day: 1, month: 0, year: 2000 }, cfg(), {})).toBe(
      "Date must be in the past",
    );
  });

  it("treats a DateValue with year=0 as invalid", () => {
    expect(pastRunner({ day: 1, month: 1, year: 0 }, cfg(), {})).toBe(
      "Date must be in the past",
    );
  });

  it("rejects an object missing day/month/year keys", () => {
    expect(pastRunner({ foo: "bar" }, cfg(), {})).toBe(
      "Date must be in the past",
    );
  });
});

describe("minYearRunner", () => {
  it("passes when year >= minYear", () => {
    expect(minYearRunner("2000-06-15", cfg(2000), {})).toBeNull();
  });

  it("fails when year < minYear", () => {
    expect(minYearRunner("1999-12-31", cfg(2000), {})).toBe(
      "Year must be 2000 or later",
    );
  });

  it("uses custom error", () => {
    expect(minYearRunner("1999-01-01", cfg(2000, "Too old"), {})).toBe(
      "Too old",
    );
  });
});

describe("maxYearRunner", () => {
  it("passes when year <= maxYear", () => {
    expect(maxYearRunner("2099-06-15", cfg(2099), {})).toBeNull();
  });

  it("fails when year > maxYear", () => {
    expect(maxYearRunner("2100-01-01", cfg(2099), {})).toBe(
      "Year must be 2099 or earlier",
    );
  });
});
