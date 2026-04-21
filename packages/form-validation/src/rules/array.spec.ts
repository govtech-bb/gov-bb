import {
  minItemsRunner,
  maxItemsRunner,
  minSelectionRunner,
  maxSelectionRunner,
  radioRunner,
} from "./array";

const cfg = (value?: unknown, error?: string) => ({ value, error });

describe("minItemsRunner", () => {
  it("passes when count >= min", () => {
    expect(minItemsRunner(["a", "b"], cfg(2), {})).toBeNull();
  });

  it("fails when count < min", () => {
    expect(minItemsRunner(["a"], cfg(2), {})).toBe(
      "Must have at least 2 item(s)",
    );
  });

  it("treats non-array as empty", () => {
    expect(minItemsRunner(null, cfg(1), {})).toBe(
      "Must have at least 1 item(s)",
    );
  });

  it("uses custom error", () => {
    expect(minItemsRunner([], cfg(1, "Need more"), {})).toBe("Need more");
  });
});

describe("maxItemsRunner", () => {
  it("passes when count <= max", () => {
    expect(maxItemsRunner(["a", "b"], cfg(3), {})).toBeNull();
  });

  it("fails when count > max", () => {
    expect(maxItemsRunner(["a", "b", "c"], cfg(2), {})).toBe(
      "Must have at most 2 item(s)",
    );
  });

  it("uses custom error", () => {
    expect(maxItemsRunner(["a", "b", "c"], cfg(2, "Too many"), {})).toBe(
      "Too many",
    );
  });
});

describe("minSelectionRunner", () => {
  it("passes when selections >= min", () => {
    expect(minSelectionRunner(["x", "y"], cfg(2), {})).toBeNull();
  });

  it("fails when selections < min", () => {
    expect(minSelectionRunner(["x"], cfg(2), {})).toBe(
      "Select at least 2 option(s)",
    );
  });
});

describe("maxSelectionRunner", () => {
  it("passes when selections <= max", () => {
    expect(maxSelectionRunner(["x"], cfg(2), {})).toBeNull();
  });

  it("fails when selections > max", () => {
    expect(maxSelectionRunner(["x", "y", "z"], cfg(2), {})).toBe(
      "Select at most 2 option(s)",
    );
  });
});

describe("radioRunner", () => {
  it("passes when value is in allowed list", () => {
    expect(
      radioRunner("male", cfg(["male", "female", "other"]), {}),
    ).toBeNull();
  });

  it("fails when value is not in allowed list", () => {
    expect(radioRunner("unknown", cfg(["male", "female"]), {})).toBe(
      "Invalid selection",
    );
  });

  it("returns null when config.value is not an array", () => {
    expect(radioRunner("male", cfg(undefined), {})).toBeNull();
  });

  it("uses custom error", () => {
    expect(radioRunner("bad", cfg(["a", "b"], "Pick a valid option"), {})).toBe(
      "Pick a valid option",
    );
  });
});
