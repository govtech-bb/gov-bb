import { describe, expect, it } from "vitest";
import { elapsedSeconds } from "./submit-duration";

describe("elapsedSeconds", () => {
  it("returns 0 when no start time", () => {
    expect(elapsedSeconds(null)).toBe(0);
  });
  it("rounds elapsed time to whole seconds", () => {
    expect(elapsedSeconds(Date.now() - 3000)).toBeGreaterThanOrEqual(2);
  });
});
