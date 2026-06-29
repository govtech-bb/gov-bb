import { describe, expect, it } from "vitest";
import { reviewDwellSeconds } from "./review-dwell";

describe("reviewDwellSeconds", () => {
  it("is 0 when review was never entered", () => {
    expect(reviewDwellSeconds(null)).toBe(0);
  });
  it("rounds dwell to whole seconds", () => {
    vi.useFakeTimers();
    vi.setSystemTime(1500);
    expect(reviewDwellSeconds(0)).toBe(2); // Math.round(1500/1000) = 2
    vi.useRealTimers();
  });
});
