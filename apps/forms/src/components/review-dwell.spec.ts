import { describe, expect, it } from "vitest";
import { reviewDwellSeconds } from "./review-dwell";

describe("reviewDwellSeconds", () => {
  it("is 0 when review was never entered", () => {
    expect(reviewDwellSeconds(null)).toBe(0);
  });
  it("rounds dwell to whole seconds", () => {
    expect(reviewDwellSeconds(Date.now() - 5000)).toBeGreaterThanOrEqual(4);
  });
});
