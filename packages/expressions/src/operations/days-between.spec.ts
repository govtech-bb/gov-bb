import { daysBetween } from "./days-between";

describe("daysBetween", () => {
  it("returns absolute day difference", () => {
    expect(daysBetween("2026-01-01", "2026-01-11")).toBe(10);
    expect(daysBetween("2026-01-11", "2026-01-01")).toBe(10);
  });
  it("returns NaN on invalid dates", () => {
    expect(daysBetween("x", "y")).toBeNaN();
  });
});
