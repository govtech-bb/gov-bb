import { compareSemver, validate, bumpMinor, bumpPatch } from "./semver";

describe("compareSemver", () => {
  it("orders by numeric segment, not lexically (1.10.0 > 1.2.0)", () => {
    expect(compareSemver("1.10.0", "1.2.0")).toBeGreaterThan(0);
    expect(compareSemver("1.2.0", "1.10.0")).toBeLessThan(0);
  });

  it("treats equal versions as 0", () => {
    expect(compareSemver("1.2.0", "1.2.0")).toBe(0);
  });

  it("ranks a 4-segment version above its 3-segment prefix", () => {
    // 1.2.0.1 has an extra patch segment, so it sorts after 1.2.0 — the
    // 3-segment lib/version.compare() lost this (it only read 3 segments).
    expect(compareSemver("1.2.0.1", "1.2.0")).toBeGreaterThan(0);
    expect(compareSemver("1.2.0", "1.2.0.1")).toBeLessThan(0);
  });

  it("sorts a non-numeric tag below any valid version (-Infinity fallback)", () => {
    // "1.2.x" → [1,2,-Infinity]; lib/version.compare() returned NaN here.
    expect(compareSemver("1.2.x", "1.2.0")).toBeLessThan(0);
    expect(compareSemver("1.2.0", "1.2.x")).toBeGreaterThan(0);
  });

  it("agrees on the latest across mixed version strings via reduce", () => {
    const versions = ["1.2.0", "1.10.0", "1.2.0.1", "1.2.x"];
    const latest = versions.reduce((best, v) =>
      compareSemver(v, best) > 0 ? v : best,
    );
    expect(latest).toBe("1.10.0");
  });
});

describe("validate", () => {
  it("accepts a well-formed X.Y.Z with major >= 1", () => {
    expect(validate("1.0.0")).toBe(true);
    expect(validate("2.13.5")).toBe(true);
  });

  it("rejects a major below 1", () => {
    expect(validate("0.9.0")).toBe(false);
  });

  it("rejects non-X.Y.Z strings", () => {
    expect(validate("1.2")).toBe(false);
    expect(validate("1.2.0.1")).toBe(false);
    expect(validate("1.2.x")).toBe(false);
    expect(validate("v1.2.0")).toBe(false);
  });
});

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
