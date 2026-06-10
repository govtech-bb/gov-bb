import { SEMVER_PATTERN, SEMVER_ERROR, semverSchema } from "./version-pattern";

describe("SEMVER_PATTERN", () => {
  it.each(["1.2.0", "0.0.0", "10.20.30", "1.0.0"])(
    "accepts plain X.Y.Z version %p",
    (version) => {
      expect(SEMVER_PATTERN.test(version)).toBe(true);
    },
  );

  it.each([
    "",
    "latest",
    "1.2",
    "1",
    "v1.2.0",
    "1.2.0-rc1",
    "1.2.0+build",
    "1.2.x",
    " 1.2.0",
    "1.2.0 ",
  ])("rejects non-plain-semver version %p", (version) => {
    expect(SEMVER_PATTERN.test(version)).toBe(false);
  });
});

describe("semverSchema", () => {
  it("accepts a plain X.Y.Z version", () => {
    expect(semverSchema.safeParse("1.2.0").success).toBe(true);
  });

  it.each(["latest", "1.2", "v1.2.0", "1.2.0-rc1"])(
    "rejects %p with the semver error",
    (version) => {
      const result = semverSchema.safeParse(version);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toBe(SEMVER_ERROR);
      }
    },
  );
});

describe("SEMVER_ERROR", () => {
  it("is a non-empty human-readable string", () => {
    expect(typeof SEMVER_ERROR).toBe("string");
    expect(SEMVER_ERROR.length).toBeGreaterThan(0);
  });
});
