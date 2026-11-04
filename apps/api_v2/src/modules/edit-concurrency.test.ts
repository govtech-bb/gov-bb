import { describe, expect, it } from "vitest";
import { EditVersion } from "./edit-concurrency";

describe("EditVersion", () => {
  it.each([1, Number.MAX_SAFE_INTEGER])(
    "accepts the safe integer boundary %s",
    (version) => {
      expect(EditVersion.parse(version)).toBe(version);
    },
  );

  it.each([
    0,
    -1,
    1.5,
    Number.MAX_SAFE_INTEGER + 1,
    Infinity,
    NaN,
    "1",
    null,
    undefined,
  ])("rejects a non-identity %s", (version) => {
    expect(EditVersion.safeParse(version).success).toBe(false);
  });
});
