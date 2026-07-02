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

// Freeze the clock so "today"-relative assertions are deterministic regardless
// of when or in which timezone the suite runs. Noon UTC is chosen so the UTC and
// Barbados (UTC-4) calendar dates coincide — today() (Barbados zone) equals TODAY
// below. The evening window where the two dates disagree is covered separately.
const TODAY = "2026-06-15";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(`${TODAY}T12:00:00Z`));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("parseDate — DateValue object format", () => {
  it("parses a valid DateValue object with string parts", () => {
    expect(
      pastRunner({ day: "1", month: "1", year: "2000" }, cfg(), {}),
    ).toBeNull();
  });

  it("parses string parts that carry leading zeros", () => {
    expect(
      pastRunner({ day: "01", month: "01", year: "2000" }, cfg(), {}),
    ).toBeNull();
  });

  it("still parses numeric parts (migration tolerance)", () => {
    expect(pastRunner({ day: 1, month: 1, year: 2000 }, cfg(), {})).toBeNull();
    expect(pastRunner({ day: 0, month: 1, year: 2000 }, cfg(), {})).toBe(
      "Date must be in the past",
    );
  });

  it("returns error when DateValue has day='0'", () => {
    expect(pastRunner({ day: "0", month: "1", year: "2000" }, cfg(), {})).toBe(
      "Date must be in the past",
    );
  });

  it("returns error when DateValue has month='0'", () => {
    expect(pastRunner({ day: "1", month: "0", year: "2000" }, cfg(), {})).toBe(
      "Date must be in the past",
    );
  });

  it("returns error when DateValue has year='0'", () => {
    expect(pastRunner({ day: "1", month: "1", year: "0" }, cfg(), {})).toBe(
      "Date must be in the past",
    );
  });

  it("returns error when a DateValue part is an empty string", () => {
    expect(pastRunner({ day: "", month: "1", year: "2000" }, cfg(), {})).toBe(
      "Date must be in the past",
    );
  });

  it("returns error for non-string non-object value", () => {
    expect(pastRunner(12345, cfg(), {})).toBe("Date must be in the past");
  });

  it("returns error for null value", () => {
    expect(pastRunner(null, cfg(), {})).toBe("Date must be in the past");
  });
});

describe("pastRunner", () => {
  it("passes for a past date", () => {
    expect(pastRunner(past, cfg(), {})).toBeNull();
  });

  it("fails for a future date", () => {
    expect(pastRunner(future, cfg(), {})).toBe("Date must be in the past");
  });

  it("fails for today", () => {
    expect(pastRunner(TODAY, cfg(), {})).toBe("Date must be in the past");
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
    expect(pastOrTodayRunner(TODAY, cfg(), {})).toBeNull();
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
    expect(futureRunner(TODAY, cfg(), {})).toBe("Date must be in the future");
  });
});

describe("futureOrTodayRunner", () => {
  it("passes for a future date", () => {
    expect(futureOrTodayRunner(future, cfg(), {})).toBeNull();
  });

  it("passes for today", () => {
    expect(futureOrTodayRunner(TODAY, cfg(), {})).toBeNull();
  });

  it("fails for a past date", () => {
    expect(futureOrTodayRunner(past, cfg(), {})).toBe(
      "Date must be today or in the future",
    );
  });
});

describe("today() timezone — Barbados vs UTC evening window (#1825)", () => {
  // 2026-07-01T02:00Z is 2026-06-30 22:00 in America/Barbados (UTC-4): the two
  // calendar dates disagree. "Today" must follow Barbados (2026-06-30), matching
  // age-gating / conditional-visibility, not the UTC date (2026-07-01). The
  // file-level beforeEach already faked timers; override the instant here.
  beforeEach(() => {
    vi.setSystemTime(new Date("2026-07-01T02:00:00Z"));
  });

  it("treats the Barbados calendar date as today, not the UTC date", () => {
    // Barbados today = 2026-06-30. Under the old UTC logic today() was
    // 2026-07-01, so this date was wrongly rejected as not-yet-today.
    expect(futureOrTodayRunner("2026-06-30", cfg(), {})).toBeNull();
    expect(pastRunner("2026-06-30", cfg(), {})).toBe(
      "Date must be in the past",
    );
  });

  it("treats the UTC-ahead date as the future", () => {
    // 2026-07-01 is tomorrow in Barbados → future, not today.
    expect(futureRunner("2026-07-01", cfg(), {})).toBeNull();
    expect(pastOrTodayRunner("2026-07-01", cfg(), {})).toBe(
      "Date must be today or in the past",
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

  it("uses referenced field via flat fallback", () => {
    expect(
      beforeRunner("2020-01-01", cfg(undefined, undefined, "endDate"), {
        "step-1": { endDate: "2020-06-01" },
      }),
    ).toBeNull();
  });

  it("fails when date is after resolved reference field", () => {
    expect(
      beforeRunner("2020-12-01", cfg(undefined, undefined, "endDate"), {
        "step-1": { endDate: "2020-06-01" },
      }),
    ).toBe("Date must be before endDate");
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
      onOrAfterRunner("2019-01-01", cfg(undefined, undefined, "startDate"), {}),
    ).toBeNull();
  });

  it("uses referenced field via flat fallback", () => {
    expect(
      onOrAfterRunner("2020-06-01", cfg(undefined, undefined, "startDate"), {
        "step-1": { startDate: "2020-01-01" },
      }),
    ).toBeNull();
  });

  it("fails when date is before resolved reference field", () => {
    expect(
      onOrAfterRunner("2019-12-31", cfg(undefined, undefined, "startDate"), {
        "step-1": { startDate: "2020-01-01" },
      }),
    ).toBe("Date must be on or after startDate");
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
});

describe("offsetMonths — reference + N months bound", () => {
  // The bound is the resolved reference date shifted forward by config.offsetMonths.
  // Used to express "end date no more than 6 months after start date".
  it("onOrBefore passes when date equals reference + offsetMonths (inclusive)", () => {
    expect(
      onOrBeforeRunner(
        "2020-07-10",
        { value: "2020-01-10", offsetMonths: 6 },
        {},
      ),
    ).toBeNull();
  });

  it("onOrBefore passes when date is before reference + offsetMonths", () => {
    expect(
      onOrBeforeRunner(
        "2020-05-01",
        { value: "2020-01-10", offsetMonths: 6 },
        {},
      ),
    ).toBeNull();
  });

  it("onOrBefore fails when date is past reference + offsetMonths", () => {
    expect(
      onOrBeforeRunner(
        "2020-07-11",
        { value: "2020-01-10", offsetMonths: 6, error: "Too far" },
        {},
      ),
    ).toBe("Too far");
  });

  it("applies offsetMonths to a resolved reference field", () => {
    expect(
      onOrBeforeRunner(
        "2020-07-10",
        {
          referenceFieldId: "startDate",
          targetStepId: "step-1",
          offsetMonths: 6,
        },
        { "step-1": { startDate: "2020-01-10" } },
      ),
    ).toBeNull();
    expect(
      onOrBeforeRunner(
        "2020-07-11",
        {
          referenceFieldId: "startDate",
          targetStepId: "step-1",
          offsetMonths: 6,
          error: "Too far",
        },
        { "step-1": { startDate: "2020-01-10" } },
      ),
    ).toBe("Too far");
  });

  it("clamps to the last day when the target month is shorter", () => {
    // 31 Aug 2020 + 6 months → Feb 2021 has 28 days, so the bound clamps to 28 Feb.
    expect(
      onOrBeforeRunner(
        "2021-02-28",
        { value: "2020-08-31", offsetMonths: 6 },
        {},
      ),
    ).toBeNull();
    expect(
      onOrBeforeRunner(
        "2021-03-01",
        { value: "2020-08-31", offsetMonths: 6, error: "Too far" },
        {},
      ),
    ).toBe("Too far");
  });

  it("also shifts the bound for the after runner", () => {
    // after reference + 1 month: must be strictly after 2020-02-01.
    expect(
      afterRunner("2020-02-02", { value: "2020-01-01", offsetMonths: 1 }, {}),
    ).toBeNull();
    expect(
      afterRunner("2020-02-01", { value: "2020-01-01", offsetMonths: 1 }, {}),
    ).toBe("Date must be after 2020-01-01");
  });

  it("leaves the bound unchanged when offsetMonths is absent", () => {
    expect(onOrBeforeRunner("2020-01-01", cfg("2020-01-01"), {})).toBeNull();
  });
});

describe("parseDate — DD/MM/YYYY literal thresholds (#633)", () => {
  // The comparison runners route the literal `config.value` threshold through
  // parseDate. Barbados authors type thresholds as DD/MM/YYYY (day-first), so a
  // `/`-separated string must parse day-first rather than as US MM/DD or
  // Invalid Date.

  it("parses a DD/MM/YYYY threshold day-first (31/12/2020 = 31 Dec 2020)", () => {
    // 1 Jan 2021 is after 31 Dec 2020.
    expect(afterRunner("2021-01-01", cfg("31/12/2020"), {})).toBeNull();
    // 30 Dec 2020 is not after 31 Dec 2020.
    expect(afterRunner("2020-12-30", cfg("31/12/2020"), {})).toBe(
      "Date must be after 31/12/2020",
    );
  });

  it("parses 01/02/2020 as 1 Feb (day-first), not 2 Jan (US MM/DD)", () => {
    // 15 Jan 2020 is before 1 Feb 2020 (day-first) -> `before` passes.
    // Were it misread as 2 Jan (US MM/DD), 15 Jan would be *after* -> `before`
    // would fail. This asserts the day-first interpretation.
    expect(beforeRunner("2020-01-15", cfg("01/02/2020"), {})).toBeNull();
    expect(afterRunner("2020-01-15", cfg("01/02/2020"), {})).toBe(
      "Date must be after 01/02/2020",
    );
  });

  it("still parses ISO (YYYY-MM-DD) thresholds (apps/api regression guard)", () => {
    expect(afterRunner("2020-06-01", cfg("2020-12-31"), {})).toBe(
      "Date must be after 2020-12-31",
    );
    expect(afterRunner("2021-01-01", cfg("2020-12-31"), {})).toBeNull();
  });

  it("accepts single-digit day/month (1/2/2020 = 1 Feb 2020)", () => {
    expect(beforeRunner("2020-01-15", cfg("1/2/2020"), {})).toBeNull();
    expect(afterRunner("2020-01-15", cfg("1/2/2020"), {})).toBe(
      "Date must be after 1/2/2020",
    );
  });

  it.each([
    // wrong shape
    "31/12",
    "1/2/3/4",
    // non-numeric / non-canonical segments (Number() must not coerce these)
    "aa/bb/cccc",
    "0x10/01/2020",
    "12.5/6/2020",
    " 5 /6/2020",
    // short / typo year
    "1/2/3",
    // out-of-range components Date.UTC would silently roll over
    "31/02/2020",
    "32/01/2020",
    "31/13/2020",
    "00/00/0000",
  ])(
    "treats malformed '/'-separated threshold %s as unparseable -> rule fires",
    (bad) => {
      expect(afterRunner("2021-01-01", cfg(bad), {})).toBe(
        `Date must be after ${bad}`,
      );
    },
  );

  it("bare-year '2020' falls through to ISO parsing, not the DD/MM fork", () => {
    // No '/', so parseDate uses new Date("2020") = 1 Jan 2020 UTC (a valid ISO
    // year). The DD/MM/YYYY fork only governs '/'-separated input; the shared
    // ISO path is left untouched so apps/api date values keep parsing.
    expect(afterRunner("2021-01-01", cfg("2020"), {})).toBeNull();
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

// Plain numeric-year inputs: `minYear`/`maxYear` also apply to number fields
// (e.g. a 4-digit "Year" input), where the value is a bare number or numeric
// string rather than a date. The runner compares it as a year directly.
describe("minYear/maxYear — plain numeric year inputs", () => {
  it("maxYear passes for a numeric year <= max", () => {
    expect(maxYearRunner(2020, cfg(2099), {})).toBeNull();
    expect(maxYearRunner("2020", cfg(2099), {})).toBeNull();
  });

  it("maxYear fails for a numeric year > max", () => {
    expect(maxYearRunner(2100, cfg(2099), {})).toBe(
      "Year must be 2099 or earlier",
    );
  });

  it("minYear passes for a numeric year >= min", () => {
    expect(minYearRunner(2005, cfg(2000), {})).toBeNull();
  });

  it("minYear fails for a numeric year < min", () => {
    expect(minYearRunner(1999, cfg(2000), {})).toBe(
      "Year must be 2000 or later",
    );
  });
});

// `currentYear: true` resolves the bound dynamically to the current year, so a
// recipe can say "not in the future" without hardcoding a literal that rots.
describe("minYear/maxYear — currentYear bound", () => {
  const thisYear = new Date().getUTCFullYear();
  const withCurrentYear = (error?: string) => ({ currentYear: true, error });

  it("maxYear passes for the current year (boundary)", () => {
    expect(maxYearRunner(thisYear, withCurrentYear(), {})).toBeNull();
  });

  it("maxYear passes for a past year", () => {
    expect(maxYearRunner(thisYear - 5, withCurrentYear(), {})).toBeNull();
  });

  it("maxYear fails for a future year", () => {
    expect(maxYearRunner(thisYear + 1, withCurrentYear(), {})).toBe(
      `Year must be ${thisYear} or earlier`,
    );
  });

  it("maxYear uses the custom error for a future year", () => {
    expect(
      maxYearRunner(
        thisYear + 1,
        withCurrentYear("Year cannot be in the future"),
        {},
      ),
    ).toBe("Year cannot be in the future");
  });

  it("minYear treats the current year as the lower bound", () => {
    expect(minYearRunner(thisYear, withCurrentYear(), {})).toBeNull();
    expect(minYearRunner(thisYear - 1, withCurrentYear(), {})).toBe(
      `Year must be ${thisYear} or later`,
    );
  });
});
