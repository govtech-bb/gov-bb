import { recipeFormStepFieldSchema } from "./form-step.type";

describe("recipeFormStepFieldSchema", () => {
  it("accepts a component field with valid ref", () => {
    const result = recipeFormStepFieldSchema.safeParse({
      ref: "components/first-name",
      overrides: { label: "Custom" },
    });
    expect(result.success).toBe(true);
  });

  it("accepts a block field with valid ref", () => {
    const result = recipeFormStepFieldSchema.safeParse({
      ref: "blocks/personal-information",
      overrides: { "first-name": { label: "Given" } },
    });
    expect(result.success).toBe(true);
  });

  it("accepts a component field without overrides", () => {
    const result = recipeFormStepFieldSchema.safeParse({
      ref: "components/generic-email",
    });
    expect(result.success).toBe(true);
  });

  it("rejects an unknown ref prefix", () => {
    const result = recipeFormStepFieldSchema.safeParse({
      ref: "garbage/foo",
    });
    expect(result.success).toBe(false);
  });
});
