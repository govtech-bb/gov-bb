import { formStepSchema, recipeFormStepSchema } from "./form-step.type";
import { stepConditionalOnBehaviourSchema } from "./behavior.type";

const validStep = {
  stepId: "personal-info",
  title: "Personal Information",
  elements: [],
};

describe("formStepSchema", () => {
  it("accepts a valid step with required fields", () => {
    expect(formStepSchema.safeParse(validStep).success).toBe(true);
  });

  it("accepts a step with optional fields", () => {
    const full = {
      ...validStep,
      description: "Enter your details",
      behaviours: [],
      nextSteps: [{ title: "What happens next" }],
    };
    expect(formStepSchema.safeParse(full).success).toBe(true);
  });

  it("preserves an optional markdownContent string", () => {
    const parsed = formStepSchema.parse({
      ...validStep,
      markdownContent: "## What you need to know\n\nContact us.",
    });
    expect(parsed.markdownContent).toBe(
      "## What you need to know\n\nContact us.",
    );
  });

  it("rejects a non-string markdownContent", () => {
    expect(
      formStepSchema.safeParse({ ...validStep, markdownContent: 42 }).success,
    ).toBe(false);
  });

  it("accepts and preserves a conditionalTitle array", () => {
    const parsed = formStepSchema.parse({
      ...validStep,
      title: "Provide the person's birth details",
      conditionalTitle: [
        {
          targetFieldId: "applying-for-yourself",
          operator: "equal",
          value: "yes",
          title: "Provide your birth details",
        },
      ],
    });
    expect(parsed.conditionalTitle).toEqual([
      {
        targetFieldId: "applying-for-yourself",
        operator: "equal",
        value: "yes",
        title: "Provide your birth details",
      },
    ]);
  });

  it("rejects a conditionalTitle entry with a non-kebab targetFieldId", () => {
    expect(
      formStepSchema.safeParse({
        ...validStep,
        conditionalTitle: [
          {
            targetFieldId: "applyingForYourself",
            operator: "equal",
            value: "yes",
            title: "Provide your birth details",
          },
        ],
      }).success,
    ).toBe(false);
  });

  it("rejects a conditionalTitle entry missing its title", () => {
    expect(
      formStepSchema.safeParse({
        ...validStep,
        conditionalTitle: [
          {
            targetFieldId: "applying-for-yourself",
            operator: "equal",
            value: "yes",
          },
        ],
      }).success,
    ).toBe(false);
  });

  it("rejects missing stepId", () => {
    const { stepId: _s, ...noStepId } = validStep;
    expect(formStepSchema.safeParse(noStepId).success).toBe(false);
  });

  it("rejects missing title", () => {
    const { title: _t, ...noTitle } = validStep;
    expect(formStepSchema.safeParse(noTitle).success).toBe(false);
  });
});

describe("recipeFormStepSchema", () => {
  it("accepts a valid recipe step with ref elements", () => {
    const recipeStep = {
      stepId: "personal-info",
      title: "Personal Information",
      elements: [{ ref: "components/first-name" }],
    };
    expect(recipeFormStepSchema.safeParse(recipeStep).success).toBe(true);
  });

  it("rejects plain primitives in elements (must use ref objects)", () => {
    const invalidStep = {
      ...validStep,
      elements: [{ fieldId: "first-name", htmlType: "text", label: "Name" }],
    };
    expect(recipeFormStepSchema.safeParse(invalidStep).success).toBe(false);
  });

  it("rejects missing stepId", () => {
    const { stepId: _s, ...noStepId } = validStep;
    expect(recipeFormStepSchema.safeParse(noStepId).success).toBe(false);
  });

  it("rejects missing title", () => {
    const { title: _t, ...noTitle } = validStep;
    expect(recipeFormStepSchema.safeParse(noTitle).success).toBe(false);
  });
});

describe("stepConditionalOnBehaviourSchema", () => {
  const validCondition = {
    type: "stepConditionalOn",
    targetFieldId: "country",
    targetStepId: "location-step",
    operator: "equal",
    value: "BB",
  };

  it("accepts a valid step condition", () => {
    expect(
      stepConditionalOnBehaviourSchema.safeParse(validCondition).success,
    ).toBe(true);
  });

  it("rejects missing operator", () => {
    const { operator: _o, ...noOperator } = validCondition;
    expect(stepConditionalOnBehaviourSchema.safeParse(noOperator).success).toBe(
      false,
    );
  });

  it("rejects invalid operator value", () => {
    expect(
      stepConditionalOnBehaviourSchema.safeParse({
        ...validCondition,
        operator: "unknown-op",
      }).success,
    ).toBe(false);
  });
});
