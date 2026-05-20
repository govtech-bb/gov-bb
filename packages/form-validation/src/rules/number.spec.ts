import {
  minRunner,
  maxRunner,
  gtRunner,
  ltRunner,
  equalRunner,
  notEqualRunner,
} from "./number";

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

describe("minRunner", () => {
  it("passes when value >= min", () => {
    expect(minRunner(5, cfg(5), {})).toBeNull();
  });

  it("fails when value < min", () => {
    expect(minRunner(3, cfg(5), {})).toBe("Must be at least 5");
  });

  it("uses custom error", () => {
    expect(minRunner(3, cfg(5, "Too small"), {})).toBe("Too small");
  });
});

describe("maxRunner", () => {
  it("passes when value <= max", () => {
    expect(maxRunner(5, cfg(5), {})).toBeNull();
  });

  it("fails when value > max", () => {
    expect(maxRunner(10, cfg(5), {})).toBe("Must be at most 5");
  });

  it("uses custom error", () => {
    expect(maxRunner(10, cfg(5, "Too large"), {})).toBe("Too large");
  });
});

describe("gtRunner", () => {
  it("passes when value > config.value", () => {
    expect(gtRunner(6, cfg(5), {})).toBeNull();
  });

  it("fails when value <= config.value", () => {
    expect(gtRunner(5, cfg(5), {})).toBe("Must be greater than 5");
  });

  it("uses referenced field via flat fallback", () => {
    expect(
      gtRunner(10, cfg(undefined, undefined, "minAge"), {
        "step-1": { minAge: 5 },
      }),
    ).toBeNull();
  });

  it("uses referenced field scoped to targetStepId", () => {
    expect(
      gtRunner(10, cfg(undefined, undefined, "minAge", "step-1"), {
        "step-1": { minAge: 5 },
        "step-2": { minAge: 999 },
      }),
    ).toBeNull();
  });

  it("skips when reference is missing from allValues", () => {
    expect(gtRunner(1, cfg(undefined, undefined, "minAge"), {})).toBeNull();
  });

  it("uses custom error", () => {
    expect(gtRunner(5, cfg(5, "Must be greater"), {})).toBe("Must be greater");
  });

  it("returns an error when referenced field value is a non-numeric string", () => {
    const result = gtRunner(10, cfg(undefined, undefined, "minAge"), {
      "step-1": { minAge: "not-a-number" },
    });
    expect(result).not.toBeNull();
  });
});

describe("ltRunner", () => {
  it("passes when value < config.value", () => {
    expect(ltRunner(4, cfg(5), {})).toBeNull();
  });

  it("fails when value >= config.value", () => {
    expect(ltRunner(5, cfg(5), {})).toBe("Must be less than 5");
  });

  it("skips when reference is missing", () => {
    expect(ltRunner(100, cfg(undefined, undefined, "maxAge"), {})).toBeNull();
  });
});

describe("equalRunner", () => {
  it("passes when numbers are equal", () => {
    expect(equalRunner(42, cfg(42), {})).toBeNull();
  });

  it("fails when numbers differ", () => {
    expect(equalRunner(1, cfg(42), {})).toBe("Must equal 42");
  });

  it("uses referenced field via flat fallback", () => {
    expect(
      equalRunner(5, cfg(undefined, undefined, "qty"), {
        "step-1": { qty: 5 },
      }),
    ).toBeNull();
  });

  it("uses referenced field scoped to targetStepId", () => {
    expect(
      equalRunner(5, cfg(undefined, undefined, "qty", "step-1"), {
        "step-1": { qty: 5 },
        "step-2": { qty: 99 },
      }),
    ).toBeNull();
  });

  it("skips when reference missing", () => {
    expect(equalRunner(1, cfg(undefined, undefined, "qty"), {})).toBeNull();
  });
});

describe("notEqualRunner", () => {
  it("passes when numbers differ", () => {
    expect(notEqualRunner(1, cfg(42), {})).toBeNull();
  });

  it("fails when numbers are equal", () => {
    expect(notEqualRunner(42, cfg(42), {})).toBe("Must not equal 42");
  });

  it("uses referenced field via flat fallback", () => {
    expect(
      notEqualRunner(5, cfg(undefined, undefined, "qty"), {
        "step-1": { qty: 10 },
      }),
    ).toBeNull();
  });

  it("skips when reference missing", () => {
    expect(notEqualRunner(1, cfg(undefined, undefined, "qty"), {})).toBeNull();
  });
});
