import { describe, expect, it } from "vitest";
import { elapsedSeconds } from "./submit-duration";

describe("elapsedSeconds", () => {
  it("returns 0 when no start time", () => {
    expect(elapsedSeconds(null)).toBe(0);
  });
  it("rounds elapsed time to whole seconds", () => {
    vi.useFakeTimers();
    vi.setSystemTime(1500);
    expect(elapsedSeconds(0)).toBe(2); // Math.round(1500/1000) = 2
    vi.useRealTimers();
  });
});
