import type { ServiceContract } from "@govtech-bb/form-types";
import { expandSubmission } from "./submission-expand";

function makeContract(
  overrides: Partial<ServiceContract> = {},
): ServiceContract {
  return {
    formId: "f",
    title: "F",
    version: "1",
    createdAt: "",
    updatedAt: "",
    steps: [],
    ...overrides,
  } as ServiceContract;
}

function step(stepId: string, fieldIds: string[], repeatableMax?: number) {
  return {
    stepId,
    title: stepId,
    elements: fieldIds.map((id) => ({
      fieldId: id,
      label: id,
      htmlType: "text",
    })) as ServiceContract["steps"][number]["elements"],
    behaviours:
      repeatableMax !== undefined
        ? [{ type: "repeatable", min: 0, max: repeatableMax } as const]
        : [],
  };
}

describe("expandSubmission", () => {
  it("expands a non-repeatable step into a single instance", () => {
    const contract = makeContract({
      steps: [step("personal", ["first-name"])],
    });
    const result = expandSubmission(contract, {
      personal: { "first-name": "Marcus" },
    });
    expect(result.shapeErrors).toEqual([]);
    expect(result.instances).toHaveLength(1);
    expect(result.instances[0]).toEqual({
      stepId: "personal",
      index: 0,
      isRepeatable: false,
      values: { "first-name": "Marcus" },
    });
  });

  it("expands a repeatable step into N instances", () => {
    const contract = makeContract({ steps: [step("jobs", ["employer"], 5)] });
    const result = expandSubmission(contract, {
      jobs: [{ employer: "ACME" }, { employer: "Initech" }],
    });
    expect(result.shapeErrors).toEqual([]);
    expect(result.instances).toHaveLength(2);
    expect(result.instances[0].index).toBe(0);
    expect(result.instances[1].index).toBe(1);
    expect(result.instances.every((i) => i.isRepeatable)).toBe(true);
  });

  it("rejects array for a non-repeatable step (E7)", () => {
    const contract = makeContract({ steps: [step("personal", ["name"])] });
    const result = expandSubmission(contract, { personal: [{ name: "x" }] });
    expect(result.shapeErrors).toEqual([
      expect.objectContaining({
        stepId: "personal",
        reason: "expected_object_got_array",
      }),
    ]);
  });

  it("rejects object for a repeatable step when no draftId (E5)", () => {
    const contract = makeContract({ steps: [step("jobs", ["e"], 3)] });
    const result = expandSubmission(contract, { jobs: { e: "x" } });
    expect(result.shapeErrors).toEqual([
      expect.objectContaining({
        stepId: "jobs",
        reason: "expected_array_got_object",
      }),
    ]);
  });

  it("coerces object→[object] for a repeatable step when draftId is set (E6)", () => {
    const contract = makeContract({ steps: [step("jobs", ["e"], 3)] });
    const result = expandSubmission(
      contract,
      { jobs: { e: "x" } },
      { draftId: "d-1" },
    );
    expect(result.shapeErrors).toEqual([]);
    expect(result.instances).toHaveLength(1);
    expect(result.instances[0].values).toEqual({ e: "x" });
  });

  it("rejects unknown stepIds (E8)", () => {
    const contract = makeContract({ steps: [step("a", ["x"])] });
    const result = expandSubmission(contract, { b: { y: "z" } });
    expect(result.shapeErrors).toEqual([
      expect.objectContaining({ stepId: "b", reason: "unknown_step" }),
    ]);
  });

  it("rejects unknown fieldIds inside instances (E9)", () => {
    const contract = makeContract({ steps: [step("a", ["x"])] });
    const result = expandSubmission(contract, { a: { x: "1", y: "2" } });
    expect(result.shapeErrors).toEqual([
      expect.objectContaining({
        stepId: "a",
        reason: "unknown_field",
        detail: expect.objectContaining({ fieldId: "y" }),
      }),
    ]);
  });

  it("rejects null instance (E10)", () => {
    const contract = makeContract({ steps: [step("jobs", ["e"], 3)] });
    const result = expandSubmission(contract, {
      jobs: [null as unknown as Record<string, unknown>],
    });
    expect(result.shapeErrors).toEqual([
      expect.objectContaining({ stepId: "jobs", reason: "null_instance" }),
    ]);
  });

  it("rejects too many instances (E4 / E16, hard ceiling at 500)", () => {
    const contract = makeContract({ steps: [step("jobs", ["e"], 1000)] });
    const result = expandSubmission(contract, {
      jobs: Array.from({ length: 501 }, () => ({ e: "x" })),
    });
    expect(result.shapeErrors).toEqual([
      expect.objectContaining({ stepId: "jobs", reason: "too_many_instances" }),
    ]);
  });

  it("rejects too many instances against contract.max if it's lower than hard cap", () => {
    const contract = makeContract({ steps: [step("jobs", ["e"], 2)] });
    const result = expandSubmission(contract, {
      jobs: [{ e: "1" }, { e: "2" }, { e: "3" }],
    });
    expect(result.shapeErrors).toEqual([
      expect.objectContaining({
        stepId: "jobs",
        reason: "too_many_instances",
        detail: expect.objectContaining({ limit: 2, received: 3 }),
      }),
    ]);
  });

  it("includes empty array as zero instances (no shape error)", () => {
    const contract = makeContract({ steps: [step("jobs", ["e"], 3)] });
    const result = expandSubmission(contract, { jobs: [] });
    expect(result.shapeErrors).toEqual([]);
    expect(result.instances).toEqual([]);
  });

  it("returns byStep map keyed by stepId", () => {
    const contract = makeContract({
      steps: [step("personal", ["name"]), step("jobs", ["e"], 5)],
    });
    const result = expandSubmission(contract, {
      personal: { name: "x" },
      jobs: [{ e: "1" }, { e: "2" }],
    });
    expect(result.byStep.get("personal")).toHaveLength(1);
    expect(result.byStep.get("jobs")).toHaveLength(2);
  });

  it("omits missing optional steps without error", () => {
    const contract = makeContract({
      steps: [step("personal", ["name"]), step("jobs", ["e"], 5)],
    });
    const result = expandSubmission(contract, { personal: { name: "x" } });
    expect(result.shapeErrors).toEqual([]);
    expect(result.byStep.get("jobs")).toBeUndefined();
  });

  it("rejects non-object non-array value for a repeatable step (else branch, lines 102-107)", () => {
    // When raw is a primitive (string/number), not an array and not a plain object
    const contract = makeContract({ steps: [step("jobs", ["e"], 3)] });
    const result = expandSubmission(contract, {
      jobs: "not-valid" as unknown as Record<string, unknown>,
    });
    expect(result.shapeErrors).toEqual([
      expect.objectContaining({
        stepId: "jobs",
        reason: "non_object_instance",
      }),
    ]);
  });

  it("rejects a non-null, non-object repeatable instance (lines 133-139)", () => {
    // When an element in the repeatable array is a non-null primitive
    const contract = makeContract({ steps: [step("jobs", ["e"], 3)] });
    const result = expandSubmission(contract, {
      jobs: [42 as unknown as Record<string, unknown>],
    });
    expect(result.shapeErrors).toEqual([
      expect.objectContaining({
        stepId: "jobs",
        index: 0,
        reason: "non_object_instance",
      }),
    ]);
  });

  it("rejects non-object non-array value for a non-repeatable step (lines 171-176)", () => {
    // When raw is a primitive (not an array, not a plain object)
    const contract = makeContract({ steps: [step("personal", ["name"])] });
    const result = expandSubmission(contract, {
      personal: "just-a-string" as unknown as Record<string, unknown>,
    });
    expect(result.shapeErrors).toEqual([
      expect.objectContaining({
        stepId: "personal",
        reason: "non_object_instance",
      }),
    ]);
  });
});
