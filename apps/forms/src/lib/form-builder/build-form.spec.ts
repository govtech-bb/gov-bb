/**
 * build-form.spec.ts
 *
 * Unit tests for buildForm.
 *
 * Coverage:
 *  - Returns correct formId, version, formTitle, formDescription
 *  - steps includes all original steps plus the injected check-your-answers step
 *  - check-your-answers is inserted before declaration step when present
 *  - check-your-answers is inserted before submission-confirmation when no declaration
 *  - idempotencyKey is the mocked uuid value
 *  - repeatSettings is populated for repeatable steps
 *  - stepConditionalTargets is populated for steps with stepConditionalOn behaviours
 */

vi.mock("uuid", () => ({ v4: () => "test-uuid-123" }));

import { buildForm } from "./build-form";
import type { ClientServiceContract, ClientPrimitive } from "@forms/types";
import type {
  RepeatableBehaviour,
  StepConditionalOnBehaviour,
} from "@govtech-bb/form-types";

// ---------------------------------------------------------------------------
// Minimal fixture helpers
// ---------------------------------------------------------------------------

function makeField(
  fieldId: string,
  stepId: string,
  overrides: Partial<ClientPrimitive> = {},
): ClientPrimitive {
  return {
    id: `${stepId}_${fieldId}`,
    fieldId,
    stepId,
    name: fieldId,
    label: fieldId,
    htmlType: "text",
    disabled: false,
    hidden: false,
    conditionallyHidden: false,
    ...overrides,
  };
}

function makeStep(
  stepId: string,
  fields: ClientPrimitive[] = [],
  behaviours?: ClientServiceContract["steps"][number]["behaviours"],
): ClientServiceContract["steps"][number] {
  return {
    stepId,
    title: `Step ${stepId}`,
    fields,
    behaviours,
  };
}

function makeContract(
  overrides: Partial<ClientServiceContract> = {},
): ClientServiceContract {
  return {
    formId: "test-form",
    title: "Test Form",
    description: "A test form description.",
    version: "1.0.0",
    createdAt: "2024-01-01T00:00:00Z",
    updatedAt: "2024-01-01T00:00:00Z",
    steps: [
      makeStep("step1", [makeField("firstName", "step1")]),
      makeStep("submission-confirmation", []),
    ],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// buildForm — basic contract metadata
// ---------------------------------------------------------------------------

describe("buildForm", () => {
  it("returns the correct formId from the contract", () => {
    const result = buildForm(makeContract({ formId: "my-form" }));
    expect(result.formId).toBe("my-form");
  });

  it("returns the correct version from the contract", () => {
    const result = buildForm(makeContract({ version: "2.5.0" }));
    expect(result.version).toBe("2.5.0");
  });

  it("maps contract.title to formTitle", () => {
    const result = buildForm(makeContract({ title: "Passport Application" }));
    expect(result.formTitle).toBe("Passport Application");
  });

  it("maps contract.description to formDescription", () => {
    const result = buildForm(
      makeContract({ description: "Submit your passport application here." }),
    );
    expect(result.formDescription).toBe(
      "Submit your passport application here.",
    );
  });

  it("uses the mocked uuid value as idempotencyKey", () => {
    const result = buildForm(makeContract());
    expect(result.idempotencyKey).toBe("test-uuid-123");
  });

  // ---------------------------------------------------------------------------
  // check-your-answers insertion
  // ---------------------------------------------------------------------------

  describe("check-your-answers insertion", () => {
    it("inserts check-your-answers before declaration when declaration is present", () => {
      const contract = makeContract({
        steps: [
          makeStep("step1", [makeField("name", "step1")]),
          makeStep("declaration", []),
          makeStep("submission-confirmation", []),
        ],
      });

      const result = buildForm(contract);
      const stepIds = result.steps.map((s) => s.stepId);

      const cyaIndex = stepIds.indexOf("check-your-answers");
      const declarationIndex = stepIds.indexOf("declaration");

      expect(cyaIndex).toBeGreaterThanOrEqual(0);
      expect(cyaIndex).toBe(declarationIndex - 1);
    });

    it("inserts check-your-answers before submission-confirmation when no declaration", () => {
      const contract = makeContract({
        steps: [
          makeStep("step1", [makeField("name", "step1")]),
          makeStep("submission-confirmation", []),
        ],
      });

      const result = buildForm(contract);
      const stepIds = result.steps.map((s) => s.stepId);

      const cyaIndex = stepIds.indexOf("check-your-answers");
      const submissionIndex = stepIds.indexOf("submission-confirmation");

      expect(cyaIndex).toBeGreaterThanOrEqual(0);
      expect(cyaIndex).toBe(submissionIndex - 1);
    });

    it("check-your-answers step has the correct stepId and title", () => {
      const result = buildForm(makeContract());
      const cya = result.steps.find((s) => s.stepId === "check-your-answers");

      expect(cya).toBeDefined();
      expect(cya!.title).toBe("Check your answers");
      expect(cya!.fields).toEqual([]);
    });

    it("includes all original steps plus check-your-answers", () => {
      const contract = makeContract({
        steps: [
          makeStep("step1", [makeField("name", "step1")]),
          makeStep("step2", [makeField("age", "step2")]),
          makeStep("submission-confirmation", []),
        ],
      });

      const result = buildForm(contract);
      const stepIds = result.steps.map((s) => s.stepId);

      expect(stepIds).toContain("step1");
      expect(stepIds).toContain("step2");
      expect(stepIds).toContain("check-your-answers");
      expect(stepIds).toContain("submission-confirmation");
      // Total: 3 original + 1 injected
      expect(result.steps.length).toBe(4);
    });

    it("does not duplicate check-your-answers when the contract already authors it", () => {
      // Newer recipes (built by the form builder) ship check-your-answers as a
      // first-class step. Injection must be idempotent — exactly one survives.
      const contract = makeContract({
        steps: [
          makeStep("step1", [makeField("name", "step1")]),
          makeStep("check-your-answers", []),
          makeStep("declaration", []),
          makeStep("submission-confirmation", []),
        ],
      });

      const result = buildForm(contract);
      const cyaSteps = result.steps.filter(
        (s) => s.stepId === "check-your-answers",
      );

      expect(cyaSteps).toHaveLength(1);
      // Untouched original count: no extra step spliced in.
      expect(result.steps.length).toBe(4);
    });

    it("preserves an authored check-your-answers position before declaration", () => {
      const contract = makeContract({
        steps: [
          makeStep("step1", [makeField("name", "step1")]),
          makeStep("check-your-answers", []),
          makeStep("declaration", []),
          makeStep("submission-confirmation", []),
        ],
      });

      const result = buildForm(contract);
      const stepIds = result.steps.map((s) => s.stepId);

      expect(stepIds.indexOf("check-your-answers")).toBe(
        stepIds.indexOf("declaration") - 1,
      );
    });
  });

  // ---------------------------------------------------------------------------
  // repeatSettings
  // ---------------------------------------------------------------------------

  describe("repeatSettings", () => {
    it("is populated for steps with a repeatable behaviour", () => {
      const repeatBehaviour: RepeatableBehaviour = {
        type: "repeatable",
        min: 1,
        max: 3,
      };
      const contract = makeContract({
        steps: [
          makeStep(
            "personalInfo",
            [makeField("name", "personalInfo")],
            [repeatBehaviour],
          ),
          makeStep("submission-confirmation", []),
        ],
      });

      const result = buildForm(contract);

      expect(result.repeatSettings["personalInfo"]).toBeDefined();
      expect(result.repeatSettings["personalInfo"].minRepeats).toBe(1);
      expect(result.repeatSettings["personalInfo"].maxRepeats).toBe(3);
    });

    it("is an empty object when no steps are repeatable", () => {
      const result = buildForm(makeContract());
      expect(result.repeatSettings).toEqual({});
    });
  });

  // ---------------------------------------------------------------------------
  // stepConditionalTargets
  // ---------------------------------------------------------------------------

  describe("stepConditionalTargets", () => {
    it("is populated for steps with stepConditionalOn behaviours", () => {
      const conditionalBehaviour: StepConditionalOnBehaviour = {
        type: "stepConditionalOn",
        targetStepId: "step1",
        targetFieldId: "hasVisit",
        operator: "equal",
        value: "yes",
      };
      const contract = makeContract({
        steps: [
          makeStep("step1", [makeField("hasVisit", "step1")]),
          makeStep(
            "step2",
            [makeField("details", "step2")],
            [conditionalBehaviour],
          ),
          makeStep("submission-confirmation", []),
        ],
      });

      const result = buildForm(contract);

      expect(result.stepConditionalTargets["step1"]).toBe("hasVisit");
    });

    it("is an empty object when no steps have stepConditionalOn behaviours", () => {
      const result = buildForm(makeContract());
      expect(result.stepConditionalTargets).toEqual({});
    });
  });

  // ---------------------------------------------------------------------------
  // defaultValues
  // ---------------------------------------------------------------------------

  describe("defaultValues", () => {
    it("defaultValues contains entries for fields with defaultValue", () => {
      const contract = makeContract({
        steps: [
          makeStep("step1", [
            makeField("country", "step1", { defaultValue: "Barbados" }),
          ]),
          makeStep("submission-confirmation", []),
        ],
      });

      const result = buildForm(contract);
      expect(result.defaultValues["step1_country"]).toBe("Barbados");
    });
  });
});
