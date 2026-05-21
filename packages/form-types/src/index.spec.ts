// Test to ensure all exports from index.ts are accessible and functional
// This helps with coverage of the re-export statements

import {
  primitiveMetadataSchema,
  htmlTypesSchema,
  optionSchema,
  basePrimitiveSchema,
  textPrimitiveSchema,
  textAreaPrimitiveSchema,
  datePrimitiveSchema,
  numberPrimitiveSchema,
  telPrimitiveSchema,
  emailPrimitiveSchema,
  checkboxPrimitiveSchema,
  selectPrimitiveSchema,
  radioPrimitiveSchema,
  filePrimitiveSchema,
  showHidePrimitiveSchema,
  primitiveSchema,
  fieldOverridesSchema,
  primitiveUISchema,
  validationConfigSchema,
  validationTypeSchema,
  validationRuleSchema,
  fieldValueSchema,
  dateValueInputSchema,
  fieldConditionalOnBehaviourSchema,
  stepConditionalOnBehaviourSchema,
  repeatableBehaviourSchema,
  fieldArrayBehaviourSchema,
  sharedFieldsBehaviourSchema,
  behaviourSchema,
  equalityOperationsSchema,
  formStepSchema,
  recipeComponentFieldSchema,
  recipeBlockFieldSchema,
  recipeFormStepFieldSchema,
  recipeFormStepSchema,
  processorSchema,
  resolvedProcessorSchema,
  dynamic,
  validateFormContract,
  dateTimeFormatSchema,
  serviceContractSchema,
  serviceContractRecipeSchema,
  contactDetailsSchema,
} from "./index";

describe("index.ts exports", () => {
  it("exports primitiveMetadataSchema", () => {
    expect(primitiveMetadataSchema).toBeDefined();
    expect(
      primitiveMetadataSchema.safeParse({ pii: true, sensitive: false })
        .success,
    ).toBe(true);
  });

  it("exports htmlTypesSchema", () => {
    expect(htmlTypesSchema).toBeDefined();
    expect(htmlTypesSchema.safeParse("text").success).toBe(true);
  });

  it("exports optionSchema", () => {
    expect(optionSchema).toBeDefined();
    expect(
      optionSchema.safeParse({ label: "Test", value: "test" }).success,
    ).toBe(true);
  });

  it("exports basePrimitiveSchema", () => {
    expect(basePrimitiveSchema).toBeDefined();
  });

  it("exports textPrimitiveSchema", () => {
    expect(textPrimitiveSchema).toBeDefined();
  });

  it("exports textAreaPrimitiveSchema", () => {
    expect(textAreaPrimitiveSchema).toBeDefined();
  });

  it("exports datePrimitiveSchema", () => {
    expect(datePrimitiveSchema).toBeDefined();
  });

  it("exports numberPrimitiveSchema", () => {
    expect(numberPrimitiveSchema).toBeDefined();
  });

  it("exports telPrimitiveSchema", () => {
    expect(telPrimitiveSchema).toBeDefined();
  });

  it("exports emailPrimitiveSchema", () => {
    expect(emailPrimitiveSchema).toBeDefined();
  });

  it("exports checkboxPrimitiveSchema", () => {
    expect(checkboxPrimitiveSchema).toBeDefined();
  });

  it("exports selectPrimitiveSchema", () => {
    expect(selectPrimitiveSchema).toBeDefined();
  });

  it("exports radioPrimitiveSchema", () => {
    expect(radioPrimitiveSchema).toBeDefined();
  });

  it("exports filePrimitiveSchema", () => {
    expect(filePrimitiveSchema).toBeDefined();
  });

  it("exports showHidePrimitiveSchema", () => {
    expect(showHidePrimitiveSchema).toBeDefined();
  });

  it("exports primitiveSchema", () => {
    expect(primitiveSchema).toBeDefined();
  });

  it("exports fieldOverridesSchema", () => {
    expect(fieldOverridesSchema).toBeDefined();
  });

  it("exports primitiveUISchema", () => {
    expect(primitiveUISchema).toBeDefined();
  });

  it("exports validationConfigSchema", () => {
    expect(validationConfigSchema).toBeDefined();
  });

  it("exports validationTypeSchema", () => {
    expect(validationTypeSchema).toBeDefined();
  });

  it("exports validationRuleSchema", () => {
    expect(validationRuleSchema).toBeDefined();
  });

  it("exports fieldValueSchema", () => {
    expect(fieldValueSchema).toBeDefined();
  });

  it("exports dateValueInputSchema", () => {
    expect(dateValueInputSchema).toBeDefined();
  });

  it("exports fieldConditionalOnBehaviourSchema", () => {
    expect(fieldConditionalOnBehaviourSchema).toBeDefined();
  });

  it("exports stepConditionalOnBehaviourSchema", () => {
    expect(stepConditionalOnBehaviourSchema).toBeDefined();
  });

  it("exports repeatableBehaviourSchema", () => {
    expect(repeatableBehaviourSchema).toBeDefined();
  });

  it("exports fieldArrayBehaviourSchema", () => {
    expect(fieldArrayBehaviourSchema).toBeDefined();
  });

  it("exports sharedFieldsBehaviourSchema", () => {
    expect(sharedFieldsBehaviourSchema).toBeDefined();
  });

  it("exports behaviourSchema", () => {
    expect(behaviourSchema).toBeDefined();
  });

  it("exports equalityOperationsSchema", () => {
    expect(equalityOperationsSchema).toBeDefined();
  });

  it("exports formStepSchema", () => {
    expect(formStepSchema).toBeDefined();
  });

  it("exports recipeComponentFieldSchema", () => {
    expect(recipeComponentFieldSchema).toBeDefined();
  });

  it("exports recipeBlockFieldSchema", () => {
    expect(recipeBlockFieldSchema).toBeDefined();
  });

  it("exports recipeFormStepFieldSchema", () => {
    expect(recipeFormStepFieldSchema).toBeDefined();
  });

  it("exports recipeFormStepSchema", () => {
    expect(recipeFormStepSchema).toBeDefined();
  });

  it("exports processorSchema", () => {
    expect(processorSchema).toBeDefined();
  });

  it("exports resolvedProcessorSchema", () => {
    expect(resolvedProcessorSchema).toBeDefined();
  });

  it("exports dynamic", () => {
    expect(dynamic).toBeDefined();
  });

  it("exports validateFormContract", () => {
    expect(validateFormContract).toBeDefined();
  });

  it("exports dateTimeFormatSchema", () => {
    expect(dateTimeFormatSchema).toBeDefined();
  });

  it("exports serviceContractSchema", () => {
    expect(serviceContractSchema).toBeDefined();
  });

  it("exports serviceContractRecipeSchema", () => {
    expect(serviceContractRecipeSchema).toBeDefined();
  });

  it("exports contactDetailsSchema", () => {
    expect(contactDetailsSchema).toBeDefined();
  });
});
