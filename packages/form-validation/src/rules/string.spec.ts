import {
  minLengthRunner,
  maxLengthRunner,
  patternRunner,
  emailRunner,
  containsRunner,
  strictEqualityRunner,
} from "./string";

const cfg = (
  value?: unknown,
  error?: string,
  referenceFieldId?: string,
  targetStepId?: string,
) => ({
  value,
  error,
  referenceFieldId,
  targetStepId,
});

describe("minLengthRunner", () => {
  it("passes when length >= min", () => {
    expect(minLengthRunner("hello", cfg(3), {})).toBeNull();
  });

  it("fails when length < min", () => {
    expect(minLengthRunner("hi", cfg(5), {})).toBe(
      "Must be at least 5 characters",
    );
  });

  it("uses custom error", () => {
    expect(minLengthRunner("hi", cfg(5, "Too short"), {})).toBe("Too short");
  });

  it("coerces non-string value to string", () => {
    expect(minLengthRunner(12345, cfg(3), {})).toBeNull();
  });

  it("coerces null to empty string", () => {
    expect(minLengthRunner(null, cfg(1), {})).toBe(
      "Must be at least 1 characters",
    );
  });

  it("coerces undefined to empty string", () => {
    expect(minLengthRunner(undefined, cfg(1), {})).toBe(
      "Must be at least 1 characters",
    );
  });
});

describe("maxLengthRunner", () => {
  it("passes when length <= max", () => {
    expect(maxLengthRunner("hi", cfg(5), {})).toBeNull();
  });

  it("fails when length > max", () => {
    expect(maxLengthRunner("toolong", cfg(3), {})).toBe(
      "Must be at most 3 characters",
    );
  });

  it("uses custom error", () => {
    expect(maxLengthRunner("toolong", cfg(3, "Too long"), {})).toBe("Too long");
  });
});

describe("patternRunner", () => {
  it("passes when matches pattern", () => {
    expect(patternRunner("abc123", cfg("^[a-z0-9]+$"), {})).toBeNull();
  });

  it("fails when does not match pattern", () => {
    expect(patternRunner("ABC!", cfg("^[a-z0-9]+$"), {})).toBe(
      "Invalid format",
    );
  });

  it("uses custom error", () => {
    expect(patternRunner("ABC", cfg("^[a-z]+$", "Lowercase only"), {})).toBe(
      "Lowercase only",
    );
  });

  it("fails closed on an invalid regex instead of throwing (#335)", () => {
    expect(patternRunner("anything", cfg("["), {})).toBe("Invalid format");
  });

  it("fails closed when config.value is undefined (#335)", () => {
    expect(patternRunner("anything", cfg(undefined), {})).toBe(
      "Invalid format",
    );
  });

  it("fails closed when config.value is a non-string (#335)", () => {
    expect(patternRunner("anything", cfg(123), {})).toBe("Invalid format");
  });
});

describe("emailRunner", () => {
  it("passes a valid email", () => {
    expect(emailRunner("user@example.com", cfg(), {})).toBeNull();
  });

  it("fails an invalid email", () => {
    expect(emailRunner("not-an-email", cfg(), {})).toBe(
      "Must be a valid email address",
    );
  });

  it("uses custom error", () => {
    expect(emailRunner("bad", cfg(undefined, "Bad email"), {})).toBe(
      "Bad email",
    );
  });
});

describe("containsRunner", () => {
  it("passes when string contains needle", () => {
    expect(containsRunner("hello world", cfg("world"), {})).toBeNull();
  });

  it("fails when string does not contain needle", () => {
    expect(containsRunner("hello", cfg("world"), {})).toBe(
      'Must contain "world"',
    );
  });

  it("uses custom error", () => {
    expect(
      containsRunner("hello", cfg("world", "Must contain world"), {}),
    ).toBe("Must contain world");
  });
});

describe("strictEqualityRunner", () => {
  it("passes when value matches config.value directly", () => {
    expect(strictEqualityRunner("abc", cfg("abc"), {})).toBeNull();
  });

  it("fails when value does not match config.value", () => {
    expect(strictEqualityRunner("abc", cfg("xyz"), {})).toBe(
      "Values do not match",
    );
  });

  it("passes when value matches referenced field via flat fallback", () => {
    expect(
      strictEqualityRunner("secret", cfg(undefined, undefined, "password"), {
        "step-1": { password: "secret" },
      }),
    ).toBeNull();
  });

  it("fails when value does not match referenced field via flat fallback", () => {
    expect(
      strictEqualityRunner("wrong", cfg(undefined, undefined, "password"), {
        "step-1": { password: "secret" },
      }),
    ).toBe("Values do not match");
  });

  it("passes when value matches referenced field scoped to targetStepId", () => {
    expect(
      strictEqualityRunner(
        "secret",
        cfg(undefined, undefined, "password", "step-1"),
        { "step-1": { password: "secret" }, "step-2": { password: "other" } },
      ),
    ).toBeNull();
  });

  it("skips cross-field rule when reference field not found in allValues", () => {
    expect(
      strictEqualityRunner(
        "anything",
        cfg(undefined, undefined, "password"),
        {},
      ),
    ).toBeNull();
  });

  it("skips when targetStepId step is missing", () => {
    expect(
      strictEqualityRunner(
        "anything",
        cfg(undefined, undefined, "password", "step-99"),
        { "step-1": { password: "secret" } },
      ),
    ).toBeNull();
  });

  it("uses custom error", () => {
    expect(strictEqualityRunner("a", cfg("b", "Does not match"), {})).toBe(
      "Does not match",
    );
  });

  it("passes when resolved is MISSING, no referenceFieldId, and value matches config.value (non-string coercion)", () => {
    expect(strictEqualityRunner(123, cfg(123), {})).toBeNull();
  });

  it("fails when resolved is MISSING, no referenceFieldId, and value does not match config.value (non-string coercion)", () => {
    expect(strictEqualityRunner(123, cfg(456), {})).toBe("Values do not match");
  });

  it("fails when reference resolves to null and value is blank (#338)", () => {
    expect(
      strictEqualityRunner("", cfg(undefined, undefined, "password"), {
        "step-1": { password: null },
      }),
    ).toBe("Values do not match");
  });

  it("fails when reference resolves to null and value is non-blank (#338)", () => {
    expect(
      strictEqualityRunner("secret", cfg(undefined, undefined, "password"), {
        "step-1": { password: null },
      }),
    ).toBe("Values do not match");
  });
});
