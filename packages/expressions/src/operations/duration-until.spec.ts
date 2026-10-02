import { DateTime } from "luxon";
import { durationUntil } from "./duration-until";
import { DEFAULT_ZONE } from "./zone";

const now = () => DateTime.now().setZone(DEFAULT_ZONE);

describe("durationUntil", () => {
  it("returns whole days until a future ISO date", () => {
    const date = now().plus({ days: 10 }).toISODate();
    expect(durationUntil(date, "days")).toBe(10);
  });

  it("counts a date exactly 14 calendar days ahead as 14 (date-only, not time-of-day)", () => {
    // Regression guard: measured from the start of today, so a legitimately
    // 14-days-ahead date is never floored to 13 by the current time of day.
    const date = now().plus({ days: 14 }).toISODate();
    expect(durationUntil(date, "days")).toBe(14);
  });

  it("returns one fewer for a date 13 days ahead", () => {
    const date = now().plus({ days: 13 }).toISODate();
    expect(durationUntil(date, "days")).toBe(13);
  });

  it("returns 0 for today", () => {
    expect(durationUntil(now().toISODate(), "days")).toBe(0);
  });

  it("returns a negative count for a past date", () => {
    const date = now().minus({ days: 5 }).toISODate();
    expect(durationUntil(date, "days")).toBe(-5);
  });

  it("accepts a { day, month, year } DateValue object", () => {
    const future = now().plus({ days: 14 });
    const value = { day: future.day, month: future.month, year: future.year };
    expect(durationUntil(value, "days")).toBe(14);
  });

  it("returns whole years until a future ISO date", () => {
    const date = now().plus({ years: 2 }).toISODate();
    expect(durationUntil(date, "years")).toBe(2);
  });

  it("returns NaN for an unparseable string", () => {
    expect(durationUntil("not-a-date", "days")).toBeNaN();
  });

  it("returns NaN for an empty string", () => {
    expect(durationUntil("", "days")).toBeNaN();
  });

  it("returns NaN for null/undefined", () => {
    expect(durationUntil(null, "days")).toBeNaN();
    expect(durationUntil(undefined, "days")).toBeNaN();
  });

  it("returns NaN for an incomplete DateValue object", () => {
    expect(durationUntil({ day: 1, month: 1 }, "days")).toBeNaN();
  });
});
