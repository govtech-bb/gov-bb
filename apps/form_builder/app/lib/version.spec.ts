/**
 * @vitest-environment node
 */
import { bumpMinor, bumpPatch } from "./version";

describe("bumpMinor", () => {
  it("increments the minor and resets the patch", () => {
    expect(bumpMinor("1.3.0")).toBe("1.4.0");
    expect(bumpMinor("1.3.5")).toBe("1.4.0");
    expect(bumpMinor("2.0.9")).toBe("2.1.0");
  });
});

describe("bumpPatch", () => {
  it("increments the patch, leaving major and minor untouched", () => {
    expect(bumpPatch("1.3.0")).toBe("1.3.1");
    expect(bumpPatch("1.3.5")).toBe("1.3.6");
    expect(bumpPatch("2.0.0")).toBe("2.0.1");
  });
});
