import { daysBetween } from "./days-between";

describe("daysBetween", () => {
  it("returns absolute day difference", () => {
    expect(daysBetween("2026-01-01", "2026-01-11")).toBe(10);
    expect(daysBetween("2026-01-11", "2026-01-01")).toBe(10);
  });
  it("returns NaN on invalid dates", () => {
    expect(daysBetween("x", "y")).toBeNaN();
  });

  // #2072 Bug 2: daysBetween previously did DateTime.fromISO(String(a)), so the
  // { day, month, year } object its sibling durationSince accepts stringified to
  // "[object Object]" → NaN. It must now parse the object shape too.
  it("handles the { day, month, year } object shape durationSince accepts", () => {
    expect(
      daysBetween(
        { day: 1, month: 1, year: 2020 },
        { day: 31, month: 1, year: 2020 },
      ),
    ).toBe(30);
  });

  it("mixes object and ISO inputs", () => {
    expect(daysBetween({ day: 1, month: 1, year: 2020 }, "2020-01-11")).toBe(
      10,
    );
  });
});
