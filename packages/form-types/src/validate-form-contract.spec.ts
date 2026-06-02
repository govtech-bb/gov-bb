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
});
