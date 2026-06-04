import { validateFormContract } from "./validate-form-contract";

const validRecipe = {
  formId: "passport-renewal",
  title: "Passport Renewal",
  version: "1.0.0",
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
  steps: [],
  processors: [
    { type: "email" as const, config: { recipientField: "personal.email" } },
  ],
};

const repeatableStep = {
  stepId: "qualifications",
  title: "Qualifications",
  elements: [{ ref: "components/text-field" }],
  behaviours: [{ type: "repeatable" as const, min: 1, max: 5 }],
};

const recipeWithRepeatable = (min: number, max: number) => ({
  ...validRecipe,
  steps: [
    {
      ...repeatableStep,
      behaviours: [{ type: "repeatable" as const, min, max }],
    },
  ],
});

describe("validateFormContract", () => {
  it("accepts a well-formed recipe", () => {
    const result = validateFormContract(validRecipe);
    expect(result.ok).toBe(true);
  });

  it("rejects when a payment processor's customerEmailPath is a JSONLogic rule", () => {
    const broken = {
      ...validRecipe,
      processors: [
        {
          type: "payment" as const,
          config: {
            provider: "ezpay",
            department: "civil-registry",
            paymentCode: "BIRTH-CERT",
            amount: 25,
            description: "x",
            customerEmailPath: { var: "values.x" },
            customerNamePath: "personal.name",
          },
        },
      ],
    };
    const result = validateFormContract(broken);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(
        result.issues.some((i) => i.path.includes("customerEmailPath")),
      ).toBe(true);
    }
  });

  it("rejects missing required fields with field-pathed issues", () => {
    const result = validateFormContract({});
    expect(result.ok).toBe(false);
    if (!result.ok) {
      const paths = result.issues.map((i) => i.path);
      expect(paths).toEqual(expect.arrayContaining(["formId", "title"]));
    }
  });

  it("rejects an empty formId and empty title with field-pathed issues", () => {
    const result = validateFormContract({
      ...validRecipe,
      formId: "",
      title: "",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      const paths = result.issues.map((i) => i.path);
      expect(paths).toEqual(expect.arrayContaining(["formId", "title"]));
    }
  });

  it("rejects a malformed (non-kebab) formId", () => {
    const result = validateFormContract({ ...validRecipe, formId: "Foo-" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues.some((i) => i.path === "formId")).toBe(true);
    }
  });

  it("accepts a recipe with templatable rule in a dynamic field", () => {
    const withRule = {
      ...validRecipe,
      processors: [
        {
          type: "payment" as const,
          config: {
            provider: "ezpay",
            department: "civil-registry",
            paymentCode: "BIRTH-CERT",
            amount: {
              if: [
                { ">=": [{ age: [{ var: "values.applicant.dob" }] }, 60] },
                0,
                25,
              ],
            },
            description: "Senior tier",
            customerEmailPath: "applicant.email",
            customerNamePath: "applicant.name",
          },
        },
      ],
    };
    const result = validateFormContract(withRule);
    expect(result.ok).toBe(true);
  });

  describe("repeatable behaviour min/max validation", () => {
    it("accepts a repeatable step with min=1, max=5", () => {
      const result = validateFormContract(recipeWithRepeatable(1, 5));
      expect(result.ok).toBe(true);
    });

    it("rejects min=0 (must be integer >= 1)", () => {
      const result = validateFormContract(recipeWithRepeatable(0, 5));
      expect(result.ok).toBe(false);
      if (!result.ok) {
        const paths = result.issues.map((i) => i.path);
        expect(paths).toContain("steps.0.behaviours.0.min");
        const minIssue = result.issues.find(
          (i) => i.path === "steps.0.behaviours.0.min",
        );
        expect(minIssue?.message).toMatch(/1/);
      }
    });

    it("rejects non-integer min (min=1.5)", () => {
      const result = validateFormContract(recipeWithRepeatable(1.5, 5));
      expect(result.ok).toBe(false);
      if (!result.ok) {
        const paths = result.issues.map((i) => i.path);
        expect(paths).toContain("steps.0.behaviours.0.min");
      }
    });

    it("rejects max < min (min=2, max=1)", () => {
      const result = validateFormContract(recipeWithRepeatable(2, 1));
      expect(result.ok).toBe(false);
      if (!result.ok) {
        const paths = result.issues.map((i) => i.path);
        expect(paths).toContain("steps.0.behaviours.0.max");
        const maxIssue = result.issues.find(
          (i) => i.path === "steps.0.behaviours.0.max",
        );
        expect(maxIssue?.message).toMatch(/min/);
      }
    });

    it("reports correct indices for repeatable behaviours on a second step", () => {
      const recipe = {
        ...validRecipe,
        steps: [
          {
            stepId: "personal-info",
            title: "Personal Info",
            elements: [{ ref: "components/text-field" }],
          },
          {
            ...repeatableStep,
            stepId: "qualifications",
            behaviours: [{ type: "repeatable" as const, min: 0, max: 5 }],
          },
        ],
      };
      const result = validateFormContract(recipe);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        const paths = result.issues.map((i) => i.path);
        expect(paths).toContain("steps.1.behaviours.0.min");
      }
    });

    it("reports both min and max issues when both are invalid", () => {
      const result = validateFormContract(recipeWithRepeatable(0, -1));
      expect(result.ok).toBe(false);
      if (!result.ok) {
        const paths = result.issues.map((i) => i.path);
        expect(paths).toContain("steps.0.behaviours.0.min");
        expect(paths).toContain("steps.0.behaviours.0.max");
      }
    });

    it("does not false-positive on a non-repeatable behaviour alongside a valid repeatable", () => {
      const recipe = {
        ...validRecipe,
        steps: [
          {
            ...repeatableStep,
            behaviours: [
              {
                type: "optionalIf" as const,
                targetFieldId: "some-field",
                operator: "equal" as const,
                value: "yes",
              },
              { type: "repeatable" as const, min: 1, max: 5 },
            ],
          },
        ],
      };
      const result = validateFormContract(recipe);
      expect(result.ok).toBe(true);
    });

    it("rejects repeatable with a float max (max=4.5)", () => {
      const result = validateFormContract(recipeWithRepeatable(1, 4.5));
      expect(result.ok).toBe(false);
      if (!result.ok) {
        const paths = result.issues.map((i) => i.path);
        expect(paths).toContain("steps.0.behaviours.0.max");
      }
    });
  });
});
