import { DateTime } from "luxon";
import { durationSince } from "./duration-since";
import { DEFAULT_ZONE } from "./zone";

const now = () => DateTime.now().setZone(DEFAULT_ZONE);

describe("durationSince", () => {
  it("returns whole years since an ISO date", () => {
    const dob = now().minus({ years: 31 }).toISODate();
    expect(durationSince(dob, "years")).toBe(31);
  });

  it("returns whole months since an ISO date", () => {
    const date = now().minus({ months: 5 }).toISODate();
    expect(durationSince(date, "months")).toBe(5);
  });

  it("returns whole days since an ISO date", () => {
    const date = now().minus({ days: 10 }).toISODate();
    expect(durationSince(date, "days")).toBe(10);
  });

  it("truncates a partial year down (24y 11m → 24)", () => {
    const dob = now().minus({ years: 24, months: 11 }).toISODate();
    expect(durationSince(dob, "years")).toBe(24);
  });

  it("counts a birthday today as a full year (no off-by-one at the tz boundary)", () => {
    const dob = now().minus({ years: 40 }).toISODate();
    expect(durationSince(dob, "years")).toBe(40);
  });

  it("accepts a { day, month, year } DateValue object", () => {
    const past = now().minus({ years: 18 });
    const value = { day: past.day, month: past.month, year: past.year };
    expect(durationSince(value, "years")).toBe(18);
  });

  it("returns NaN for an unparseable string", () => {
    expect(durationSince("not-a-date", "years")).toBeNaN();
  });

  it("returns NaN for an empty string", () => {
    expect(durationSince("", "years")).toBeNaN();
  });

  it("returns NaN for null/undefined", () => {
    expect(durationSince(null, "years")).toBeNaN();
    expect(durationSince(undefined, "years")).toBeNaN();
  });

  it("returns NaN for an incomplete DateValue object", () => {
    expect(durationSince({ day: 1, month: 1 }, "years")).toBeNaN();
  });
});
