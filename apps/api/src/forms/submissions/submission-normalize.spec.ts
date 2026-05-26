import { normalizeForStorage } from "./submission-normalize";
import type { StepInstance } from "./submission-expand";

const inst = (
  stepId: string,
  index: number,
  isRepeatable: boolean,
  values: Record<string, unknown>,
): StepInstance => ({ stepId, index, isRepeatable, values });

describe("normalizeForStorage", () => {
  it("drops entire step entry when step is hidden (E11)", () => {
    const result = normalizeForStorage({
      instances: [inst("hidden-step", 0, false, { a: "x" })],
      hiddenStepIds: new Set(["hidden-step"]),
      activeFieldsByInstance: new Map(),
    });
    expect(result).toEqual({});
  });

  it("drops hidden field values within a visible non-repeatable step (E12)", () => {
    const active = new Map<string, Array<Set<string>>>();
    active.set("personal", [new Set(["first-name"])]); // last-name hidden

    const result = normalizeForStorage({
      instances: [
        inst("personal", 0, false, {
          "first-name": "Marcus",
          "last-name": "ShouldBeDropped",
        }),
      ],
      hiddenStepIds: new Set(),
      activeFieldsByInstance: active,
    });

    expect(result).toEqual({ personal: { "first-name": "Marcus" } });
  });

  it("preserves repeatable step as array and keeps all submitted instances", () => {
    const active = new Map<string, Array<Set<string>>>();
    active.set("jobs", [new Set(["employer"]), new Set(["employer"])]);

    const result = normalizeForStorage({
      instances: [
        inst("jobs", 0, true, { employer: "ACME", secret: "drop" }),
        inst("jobs", 1, true, { employer: "Initech" }),
      ],
      hiddenStepIds: new Set(),
      activeFieldsByInstance: active,
    });

    expect(result).toEqual({
      jobs: [{ employer: "ACME" }, { employer: "Initech" }],
    });
  });

  it("preserves repeatable empty array shape", () => {
    const result = normalizeForStorage({
      instances: [],
      hiddenStepIds: new Set(),
      activeFieldsByInstance: new Map(),
    });
    expect(result).toEqual({});
  });

  it("drops a field whose entire instance has no active fields (all hidden)", () => {
    const active = new Map<string, Array<Set<string>>>();
    active.set("jobs", [new Set([]), new Set(["employer"])]);

    const result = normalizeForStorage({
      instances: [
        inst("jobs", 0, true, { employer: "X" }),
        inst("jobs", 1, true, { employer: "Y" }),
      ],
      hiddenStepIds: new Set(),
      activeFieldsByInstance: active,
    });

    // Instance 0 becomes {} but is preserved (frontend controls instance count).
    expect(result).toEqual({ jobs: [{}, { employer: "Y" }] });
  });

  it("is idempotent on already-clean values", () => {
    const active = new Map<string, Array<Set<string>>>();
    active.set("personal", [new Set(["name"])]);

    const once = normalizeForStorage({
      instances: [inst("personal", 0, false, { name: "x" })],
      hiddenStepIds: new Set(),
      activeFieldsByInstance: active,
    });
    expect(once).toEqual({ personal: { name: "x" } });
  });

  it("returns empty object for step when activeFieldsByInstance has no entry for the step", () => {
    // Branch: activeFieldsByInstance.get(stepId) ?? [] → [],
    // then activeArr[0] === undefined → filterToActive returns {}
    const result = normalizeForStorage({
      instances: [inst("personal", 0, false, { name: "Alice" })],
      hiddenStepIds: new Set(),
      activeFieldsByInstance: new Map(), // no entry for "personal"
    });
    expect(result).toEqual({ personal: {} });
  });

  it("returns empty object for a repeatable instance when its active set is absent", () => {
    // activeArr has only one entry for index 0, but instance index 1 has no Set
    const active = new Map<string, Array<Set<string>>>();
    active.set("jobs", [new Set(["employer"])]); // only index 0 has a Set

    const result = normalizeForStorage({
      instances: [
        inst("jobs", 0, true, { employer: "ACME" }),
        inst("jobs", 1, true, { employer: "Initech" }),
      ],
      hiddenStepIds: new Set(),
      activeFieldsByInstance: active,
    });
    // Instance 1 has no active set → filterToActive(values, undefined) → {}
    expect(result).toEqual({ jobs: [{ employer: "ACME" }, {}] });
  });
});
