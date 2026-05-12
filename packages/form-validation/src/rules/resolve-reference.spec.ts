import { resolveReference, MISSING } from "./resolve-reference";

describe("resolveReference — scope rules (matches form-conditions §3)", () => {
  it("uses instance-local stepValues first when no targetStepId", () => {
    const config = { referenceFieldId: "x" } as never;
    const result = resolveReference(
      config,
      { other: { x: "fromAll" } },
      {
        x: "fromInstance",
      },
    );
    expect(result).toBe("fromInstance");
  });

  it("uses targetStepId step when set, even if same fieldId exists in stepValues", () => {
    const config = {
      referenceFieldId: "x",
      targetStepId: "other",
    } as never;
    const result = resolveReference(
      config,
      { other: { x: "fromTarget" } },
      {
        x: "fromInstance",
      },
    );
    expect(result).toBe("fromTarget");
  });

  it("uses instance 0 of a repeatable targetStepId", () => {
    const config = {
      referenceFieldId: "x",
      targetStepId: "jobs",
    } as never;
    const result = resolveReference(
      config,
      { jobs: [{ x: "first" }, { x: "second" }] },
      {},
    );
    expect(result).toBe("first");
  });

  it("falls back to flat scan across non-array steps", () => {
    const config = { referenceFieldId: "x" } as never;
    const result = resolveReference(
      config,
      { a: { x: "fromA" }, b: { x: "fromB" } },
      {},
    );
    // Last write wins (consistent with form-conditions flatten semantics).
    expect(result).toBe("fromB");
  });

  it("skips array steps in flat scan", () => {
    const config = { referenceFieldId: "x" } as never;
    const result = resolveReference(
      config,
      { jobs: [{ x: "array" }], a: { x: "object" } },
      {},
    );
    expect(result).toBe("object");
  });

  it("returns MISSING when reference cannot be resolved", () => {
    const config = { referenceFieldId: "x" } as never;
    const result = resolveReference(config, {}, {});
    expect(result).toBe(MISSING);
  });
});
