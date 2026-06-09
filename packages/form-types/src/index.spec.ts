// Tests covering re-exports from index.ts.
// Each schema is exercised with at least one valid and, where required fields
// exist, one invalid input so the re-export path is meaningfully covered.

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
  optionalIfBehaviourSchema,
  stepConditionalOnBehaviourSchema,
  repeatableBehaviourSchema,
  fieldArrayBehaviourSchema,
  sharedFieldsBehaviourSchema,
  behaviourSchema,
  equalityOperationsSchema,
  durationTransformSchema,
  formStepSchema,
  recipeComponentFieldSchema,
  recipeBlockFieldSchema,
  recipeFormStepFieldSchema,
  recipeFormStepSchema,
  processorSchema,
  resolvedProcessorSchema,
  paymentConfigAuthorSchema,
  formConfigBlobSchema,
  parseFormConfigBlob,
  dynamic,
  shallowMergeDefined,
  validateFormContract,
  dateTimeFormatSchema,
  serviceContractSchema,
  serviceContractRecipeSchema,
  contactDetailsSchema,
  KEBAB_ID_PATTERN,
  KEBAB_ID_ERROR,
  classifyRecipientField,
  CONTACT_DETAILS_PREFIX,
  CONFIG_RECIPIENT_PREFIX,
  deployBranchName,
  eraseBranchName,
} from "./index";
import { z } from "zod";

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const validTextField = {
  fieldId: "f1",
  label: "Name",
  htmlType: "text" as const,
};

// ---------------------------------------------------------------------------
// primitive.type exports
// ---------------------------------------------------------------------------

describe("primitiveMetadataSchema", () => {
  it("accepts valid metadata", () => {
    expect(
      primitiveMetadataSchema.safeParse({ pii: true, sensitive: false })
        .success,
    ).toBe(true);
  });

  it("rejects when pii is missing", () => {
    expect(
      primitiveMetadataSchema.safeParse({ sensitive: false }).success,
    ).toBe(false);
  });
});

describe("htmlTypesSchema", () => {
  it("accepts a known html type", () => {
    expect(htmlTypesSchema.safeParse("text").success).toBe(true);
  });

  it("rejects an unknown html type", () => {
    expect(htmlTypesSchema.safeParse("div").success).toBe(false);
  });
});

describe("optionSchema", () => {
  it("accepts a valid option", () => {
    expect(optionSchema.safeParse({ label: "Yes", value: "yes" }).success).toBe(
      true,
    );
  });

  it("rejects when label is missing", () => {
    expect(optionSchema.safeParse({ value: "yes" }).success).toBe(false);
  });
});

describe("basePrimitiveSchema", () => {
  it("accepts a minimal valid field", () => {
    expect(basePrimitiveSchema.safeParse(validTextField).success).toBe(true);
  });

  it("rejects when fieldId is missing", () => {
    expect(
      basePrimitiveSchema.safeParse({ label: "Name", htmlType: "text" })
        .success,
    ).toBe(false);
  });
});

describe("textPrimitiveSchema", () => {
  it("accepts a text field", () => {
    expect(
      textPrimitiveSchema.safeParse({ ...validTextField, htmlType: "text" })
        .success,
    ).toBe(true);
  });

  it("rejects a non-text htmlType", () => {
    expect(
      textPrimitiveSchema.safeParse({ ...validTextField, htmlType: "email" })
        .success,
    ).toBe(false);
  });
});

describe("textAreaPrimitiveSchema", () => {
  it("accepts a textarea field", () => {
    expect(
      textAreaPrimitiveSchema.safeParse({
        ...validTextField,
        htmlType: "textarea",
      }).success,
    ).toBe(true);
  });

  it("rejects a non-textarea htmlType", () => {
    expect(
      textAreaPrimitiveSchema.safeParse({ ...validTextField, htmlType: "text" })
        .success,
    ).toBe(false);
  });
});

describe("datePrimitiveSchema", () => {
  it("accepts a date field", () => {
    expect(
      datePrimitiveSchema.safeParse({ ...validTextField, htmlType: "date" })
        .success,
    ).toBe(true);
  });

  it("rejects a non-date htmlType", () => {
    expect(
      datePrimitiveSchema.safeParse({ ...validTextField, htmlType: "text" })
        .success,
    ).toBe(false);
  });
});

describe("numberPrimitiveSchema", () => {
  it("accepts a number field", () => {
    expect(
      numberPrimitiveSchema.safeParse({ ...validTextField, htmlType: "number" })
        .success,
    ).toBe(true);
  });

  it("rejects a non-number htmlType", () => {
    expect(
      numberPrimitiveSchema.safeParse({ ...validTextField, htmlType: "text" })
        .success,
    ).toBe(false);
  });
});

describe("telPrimitiveSchema", () => {
  it("accepts a tel field", () => {
    expect(
      telPrimitiveSchema.safeParse({ ...validTextField, htmlType: "tel" })
        .success,
    ).toBe(true);
  });

  it("rejects a non-tel htmlType", () => {
    expect(
      telPrimitiveSchema.safeParse({ ...validTextField, htmlType: "text" })
        .success,
    ).toBe(false);
  });
});

describe("emailPrimitiveSchema", () => {
  it("accepts an email field", () => {
    expect(
      emailPrimitiveSchema.safeParse({ ...validTextField, htmlType: "email" })
        .success,
    ).toBe(true);
  });

  it("rejects a non-email htmlType", () => {
    expect(
      emailPrimitiveSchema.safeParse({ ...validTextField, htmlType: "text" })
        .success,
    ).toBe(false);
  });
});

describe("checkboxPrimitiveSchema", () => {
  it("accepts a checkbox field with options", () => {
    expect(
      checkboxPrimitiveSchema.safeParse({
        ...validTextField,
        htmlType: "checkbox",
        options: [{ label: "Yes", value: "yes" }],
      }).success,
    ).toBe(true);
  });

  it("rejects when options array is missing", () => {
    expect(
      checkboxPrimitiveSchema.safeParse({
        ...validTextField,
        htmlType: "checkbox",
      }).success,
    ).toBe(false);
  });
});

describe("selectPrimitiveSchema", () => {
  it("accepts a select field with options and multiple flag", () => {
    expect(
      selectPrimitiveSchema.safeParse({
        ...validTextField,
        htmlType: "select",
        options: [{ label: "A", value: "a" }],
        multiple: false,
      }).success,
    ).toBe(true);
  });

  it("rejects when multiple is missing", () => {
    expect(
      selectPrimitiveSchema.safeParse({
        ...validTextField,
        htmlType: "select",
        options: [{ label: "A", value: "a" }],
      }).success,
    ).toBe(false);
  });
});

describe("radioPrimitiveSchema", () => {
  it("accepts a radio field with options", () => {
    expect(
      radioPrimitiveSchema.safeParse({
        ...validTextField,
        htmlType: "radio",
        options: [{ label: "Yes", value: "yes" }],
      }).success,
    ).toBe(true);
  });

  it("rejects when options array is missing", () => {
    expect(
      radioPrimitiveSchema.safeParse({
        ...validTextField,
        htmlType: "radio",
      }).success,
    ).toBe(false);
  });
});

describe("filePrimitiveSchema", () => {
  it("accepts a file field with multiple flag", () => {
    expect(
      filePrimitiveSchema.safeParse({
        ...validTextField,
        htmlType: "file",
        multiple: false,
      }).success,
    ).toBe(true);
  });

  it("rejects when multiple is missing", () => {
    expect(
      filePrimitiveSchema.safeParse({
        ...validTextField,
        htmlType: "file",
      }).success,
    ).toBe(false);
  });
});

describe("showHidePrimitiveSchema", () => {
  it("accepts a show-hide field", () => {
    expect(
      showHidePrimitiveSchema.safeParse({
        ...validTextField,
        htmlType: "show-hide",
      }).success,
    ).toBe(true);
  });

  it("rejects a non-show-hide htmlType", () => {
    expect(
      showHidePrimitiveSchema.safeParse({ ...validTextField, htmlType: "text" })
        .success,
    ).toBe(false);
  });
});

describe("primitiveSchema (discriminated union)", () => {
  it("accepts a text primitive", () => {
    expect(
      primitiveSchema.safeParse({ ...validTextField, htmlType: "text" })
        .success,
    ).toBe(true);
  });

  it("rejects an unknown htmlType", () => {
    expect(
      primitiveSchema.safeParse({ ...validTextField, htmlType: "hidden" })
        .success,
    ).toBe(false);
  });
});

describe("fieldOverridesSchema", () => {
  it("accepts an empty object (all fields optional)", () => {
    expect(fieldOverridesSchema.safeParse({}).success).toBe(true);
  });

  it("accepts a partial override", () => {
    expect(
      fieldOverridesSchema.safeParse({ label: "Updated Label" }).success,
    ).toBe(true);
  });
});

describe("primitiveUISchema", () => {
  it("accepts a valid width", () => {
    expect(primitiveUISchema.safeParse({ width: "short" }).success).toBe(true);
  });

  it("rejects an invalid width value", () => {
    expect(primitiveUISchema.safeParse({ width: "wide" }).success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// validation.type exports
// ---------------------------------------------------------------------------

describe("validationConfigSchema", () => {
  it("accepts an empty object (all fields optional)", () => {
    expect(validationConfigSchema.safeParse({}).success).toBe(true);
  });

  it("accepts a config with an error message", () => {
    expect(
      validationConfigSchema.safeParse({ error: "This field is required" })
        .success,
    ).toBe(true);
  });
});

describe("validationTypeSchema", () => {
  it("accepts a known validation type", () => {
    expect(validationTypeSchema.safeParse("required").success).toBe(true);
  });

  it("rejects an unknown validation type", () => {
    expect(validationTypeSchema.safeParse("unknownRule").success).toBe(false);
  });
});

describe("validationRuleSchema", () => {
  it("accepts an empty object", () => {
    expect(validationRuleSchema.safeParse({}).success).toBe(true);
  });

  it("accepts a rule with a known key", () => {
    expect(
      validationRuleSchema.safeParse({ required: { error: "Required" } })
        .success,
    ).toBe(true);
  });

  it("rejects a rule with a non-enum key", () => {
    expect(validationRuleSchema.safeParse({ unknownRule: {} }).success).toBe(
      false,
    );
  });
});

describe("fieldValueSchema", () => {
  it("accepts a string value", () => {
    expect(fieldValueSchema.safeParse("hello").success).toBe(true);
  });

  it("accepts a number value", () => {
    expect(fieldValueSchema.safeParse(42).success).toBe(true);
  });

  it("accepts a boolean value", () => {
    expect(fieldValueSchema.safeParse(true).success).toBe(true);
  });

  it("accepts an array value", () => {
    expect(fieldValueSchema.safeParse(["a", 1]).success).toBe(true);
  });

  it("rejects null", () => {
    expect(fieldValueSchema.safeParse(null).success).toBe(false);
  });
});

describe("dateValueInputSchema", () => {
  // Tolerant during the number→string migration (ADR 0043): both shapes parse.
  it("accepts a full date object with string parts", () => {
    expect(
      dateValueInputSchema.safeParse({ day: "1", month: "6", year: "2024" })
        .success,
    ).toBe(true);
  });

  it("accepts a full date object with numeric parts", () => {
    expect(
      dateValueInputSchema.safeParse({ day: 1, month: 6, year: 2024 }).success,
    ).toBe(true);
  });

  it("preserves string parts verbatim, including leading zeros", () => {
    const parsed = dateValueInputSchema.parse({
      day: "09",
      month: "06",
      year: "2024",
    });
    expect(parsed).toEqual({ day: "09", month: "06", year: "2024" });
  });

  it("accepts an empty object (all fields optional)", () => {
    expect(dateValueInputSchema.safeParse({}).success).toBe(true);
  });

  it("rejects a part that is neither string nor number", () => {
    expect(dateValueInputSchema.safeParse({ day: true }).success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// behavior.type exports
// ---------------------------------------------------------------------------

describe("equalityOperationsSchema", () => {
  it("accepts a valid operator", () => {
    expect(equalityOperationsSchema.safeParse("equal").success).toBe(true);
  });

  it("rejects an unknown operator", () => {
    expect(equalityOperationsSchema.safeParse("greaterThan").success).toBe(
      false,
    );
  });
});

describe("durationTransformSchema", () => {
  it("accepts a known duration transform", () => {
    expect(durationTransformSchema.safeParse("yearsSince").success).toBe(true);
  });

  it("rejects an unknown transform", () => {
    expect(durationTransformSchema.safeParse("weeksSince").success).toBe(false);
  });
});

describe("fieldConditionalOnBehaviourSchema", () => {
  const valid = {
    type: "fieldConditionalOn" as const,
    targetFieldId: "country",
    operator: "equal" as const,
    value: "BB",
  };

  it("accepts a valid fieldConditionalOn behaviour", () => {
    expect(fieldConditionalOnBehaviourSchema.safeParse(valid).success).toBe(
      true,
    );
  });

  it("rejects when targetFieldId is missing", () => {
    const { targetFieldId: _, ...rest } = valid;
    expect(fieldConditionalOnBehaviourSchema.safeParse(rest).success).toBe(
      false,
    );
  });
});

describe("optionalIfBehaviourSchema", () => {
  const valid = {
    type: "optionalIf" as const,
    targetFieldId: "country",
    operator: "equal" as const,
    value: "BB",
  };

  it("accepts a valid optionalIf behaviour", () => {
    expect(optionalIfBehaviourSchema.safeParse(valid).success).toBe(true);
  });

  it("accepts an optional targetStepId", () => {
    expect(
      optionalIfBehaviourSchema.safeParse({ ...valid, targetStepId: "step-2" })
        .success,
    ).toBe(true);
  });

  it("rejects when targetFieldId is missing", () => {
    const { targetFieldId: _, ...rest } = valid;
    expect(optionalIfBehaviourSchema.safeParse(rest).success).toBe(false);
  });

  it("rejects the wrong type discriminant", () => {
    expect(
      optionalIfBehaviourSchema.safeParse({
        ...valid,
        type: "fieldConditionalOn",
      }).success,
    ).toBe(false);
  });
});

describe("stepConditionalOnBehaviourSchema", () => {
  const valid = {
    type: "stepConditionalOn" as const,
    targetFieldId: "country",
    targetStepId: "step-2",
    operator: "equal" as const,
    value: "BB",
  };

  it("accepts a valid stepConditionalOn behaviour", () => {
    expect(stepConditionalOnBehaviourSchema.safeParse(valid).success).toBe(
      true,
    );
  });

  it("rejects when targetStepId is missing", () => {
    const { targetStepId: _, ...rest } = valid;
    expect(stepConditionalOnBehaviourSchema.safeParse(rest).success).toBe(
      false,
    );
  });
});

describe("repeatableBehaviourSchema", () => {
  it("accepts a valid repeatable behaviour", () => {
    expect(
      repeatableBehaviourSchema.safeParse({
        type: "repeatable",
        min: 1,
        max: 5,
      }).success,
    ).toBe(true);
  });

  it("rejects when min is missing", () => {
    expect(
      repeatableBehaviourSchema.safeParse({ type: "repeatable", max: 5 })
        .success,
    ).toBe(false);
  });

  it("accepts an optional addAnotherLabel", () => {
    const result = repeatableBehaviourSchema.safeParse({
      type: "repeatable",
      min: 1,
      max: 5,
      addAnotherLabel: "Do you want to add another qualification?",
    });
    expect(result.success).toBe(true);
  });

  it("rejects an empty addAnotherLabel", () => {
    const result = repeatableBehaviourSchema.safeParse({
      type: "repeatable",
      min: 1,
      max: 5,
      addAnotherLabel: "",
    });
    expect(result.success).toBe(false);
  });

  it("accepts an optional instanceLabel", () => {
    const result = repeatableBehaviourSchema.safeParse({
      type: "repeatable",
      min: 1,
      max: 5,
      instanceLabel: "Dependent",
    });
    expect(result.success).toBe(true);
  });

  it("rejects an empty instanceLabel", () => {
    const result = repeatableBehaviourSchema.safeParse({
      type: "repeatable",
      min: 1,
      max: 5,
      instanceLabel: "",
    });
    expect(result.success).toBe(false);
  });
});

describe("fieldArrayBehaviourSchema", () => {
  it("accepts a valid fieldArray behaviour", () => {
    expect(
      fieldArrayBehaviourSchema.safeParse({
        type: "fieldArray",
        min: 0,
        max: 10,
      }).success,
    ).toBe(true);
  });

  it("rejects when max is missing", () => {
    expect(
      fieldArrayBehaviourSchema.safeParse({ type: "fieldArray", min: 0 })
        .success,
    ).toBe(false);
  });
});

describe("sharedFieldsBehaviourSchema", () => {
  it("accepts a valid sharedFields behaviour", () => {
    expect(
      sharedFieldsBehaviourSchema.safeParse({
        type: "sharedFields",
        fieldIds: ["f1", "f2"],
      }).success,
    ).toBe(true);
  });

  it("rejects when fieldIds is missing", () => {
    expect(
      sharedFieldsBehaviourSchema.safeParse({ type: "sharedFields" }).success,
    ).toBe(false);
  });
});

describe("behaviourSchema (discriminated union)", () => {
  it("accepts a repeatable behaviour", () => {
    expect(
      behaviourSchema.safeParse({ type: "repeatable", min: 1, max: 3 }).success,
    ).toBe(true);
  });

  it("accepts an optionalIf behaviour", () => {
    expect(
      behaviourSchema.safeParse({
        type: "optionalIf",
        targetFieldId: "country",
        operator: "equal",
        value: "BB",
      }).success,
    ).toBe(true);
  });

  it("rejects an unknown behaviour type", () => {
    expect(behaviourSchema.safeParse({ type: "unknown" }).success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// form-step.type exports
// ---------------------------------------------------------------------------

const validStep = {
  stepId: "step-1",
  title: "Personal Details",
  elements: [{ ...validTextField, htmlType: "text" as const }],
};

describe("formStepSchema", () => {
  it("accepts a valid form step", () => {
    expect(formStepSchema.safeParse(validStep).success).toBe(true);
  });

  it("rejects when stepId is missing", () => {
    const { stepId: _, ...rest } = validStep;
    expect(formStepSchema.safeParse(rest).success).toBe(false);
  });
});

describe("recipeComponentFieldSchema", () => {
  it("accepts a valid component ref", () => {
    expect(
      recipeComponentFieldSchema.safeParse({ ref: "components/my-field" })
        .success,
    ).toBe(true);
  });

  it("rejects a ref that does not start with components/", () => {
    expect(
      recipeComponentFieldSchema.safeParse({ ref: "blocks/my-block" }).success,
    ).toBe(false);
  });
});

describe("recipeBlockFieldSchema", () => {
  it("accepts a valid block ref", () => {
    expect(
      recipeBlockFieldSchema.safeParse({ ref: "blocks/my-block" }).success,
    ).toBe(true);
  });

  it("rejects a ref that does not start with blocks/", () => {
    expect(
      recipeBlockFieldSchema.safeParse({ ref: "components/my-comp" }).success,
    ).toBe(false);
  });
});

describe("recipeFormStepFieldSchema (union)", () => {
  it("accepts a component ref", () => {
    expect(
      recipeFormStepFieldSchema.safeParse({ ref: "components/field-a" })
        .success,
    ).toBe(true);
  });

  it("accepts a block ref", () => {
    expect(
      recipeFormStepFieldSchema.safeParse({ ref: "blocks/block-a" }).success,
    ).toBe(true);
  });

  it("rejects a ref with an unknown prefix", () => {
    expect(
      recipeFormStepFieldSchema.safeParse({ ref: "other/something" }).success,
    ).toBe(false);
  });
});

describe("recipeFormStepSchema", () => {
  const validRecipeStep = {
    stepId: "step-1",
    title: "Step One",
    elements: [{ ref: "components/field-a" }],
  };

  it("accepts a valid recipe step", () => {
    expect(recipeFormStepSchema.safeParse(validRecipeStep).success).toBe(true);
  });

  it("rejects when elements contain an invalid ref", () => {
    expect(
      recipeFormStepSchema.safeParse({
        ...validRecipeStep,
        elements: [{ ref: "other/field" }],
      }).success,
    ).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// processor.type exports (re-export path only — detailed tests in processor.type.spec.ts)
// ---------------------------------------------------------------------------

describe("processorSchema (re-export)", () => {
  it("accepts a valid email processor", () => {
    expect(
      processorSchema.safeParse({
        type: "email",
        config: { recipientField: "personal.email" },
      }).success,
    ).toBe(true);
  });

  it("rejects an unknown processor type", () => {
    expect(processorSchema.safeParse({ type: "fax", config: {} }).success).toBe(
      false,
    );
  });
});

describe("resolvedProcessorSchema (re-export)", () => {
  it("accepts a resolved email processor", () => {
    expect(
      resolvedProcessorSchema.safeParse({
        type: "email",
        config: { recipientField: "personal.email" },
      }).success,
    ).toBe(true);
  });

  it("rejects when type is unrecognised", () => {
    expect(
      resolvedProcessorSchema.safeParse({ type: "unknown", config: {} })
        .success,
    ).toBe(false);
  });
});

describe("paymentConfigAuthorSchema (re-export)", () => {
  it("accepts a valid ezpay payment config", () => {
    expect(
      paymentConfigAuthorSchema.safeParse({
        provider: "ezpay",
        department: "civil-registry",
        paymentCode: "BIRTH-CERT",
        amount: 50,
        description: "Birth certificate",
        customerEmailPath: "personal.email",
        customerNamePath: "personal.name",
      }).success,
    ).toBe(true);
  });

  it("rejects a non-ezpay provider", () => {
    expect(
      paymentConfigAuthorSchema.safeParse({ provider: "stripe" }).success,
    ).toBe(false);
  });
});

describe("formConfigBlobSchema (re-export)", () => {
  it("accepts an empty blob", () => {
    expect(formConfigBlobSchema.safeParse({}).success).toBe(true);
  });

  it("rejects a non-array processors key", () => {
    expect(formConfigBlobSchema.safeParse({ processors: {} }).success).toBe(
      false,
    );
  });
});

describe("parseFormConfigBlob (re-export)", () => {
  it("maps null to an empty blob", () => {
    expect(parseFormConfigBlob(null)).toEqual({});
  });

  it("throws on an invalid blob", () => {
    expect(() => parseFormConfigBlob({ processors: "nope" })).toThrow();
  });
});

// ---------------------------------------------------------------------------
// dynamic (factory function)
// ---------------------------------------------------------------------------

describe("dynamic", () => {
  it("returns a schema that accepts the literal type", () => {
    const schema = dynamic(z.string().min(1));
    expect(schema.safeParse("hello").success).toBe(true);
  });

  it("returns a schema that also accepts a JSONLogic-style rule object", () => {
    const schema = dynamic(z.string().min(1));
    expect(schema.safeParse({ var: "values.name" }).success).toBe(true);
  });

  it("rejects values that match neither branch", () => {
    const schema = dynamic(z.string().min(1));
    // 42 fails both z.string().min(1) and z.record(z.string(), z.unknown()), so
    // the union rejects it.
    expect(schema.safeParse(42).success).toBe(false);
  });
});

describe("shallowMergeDefined (re-export)", () => {
  it("merges override keys over the base", () => {
    expect(shallowMergeDefined({ a: 1, b: 2 }, { b: 3 })).toEqual({
      a: 1,
      b: 3,
    });
  });
});

// ---------------------------------------------------------------------------
// service-contract.type exports
// ---------------------------------------------------------------------------

describe("dateTimeFormatSchema", () => {
  it("accepts a valid ISO 8601 datetime with offset", () => {
    expect(dateTimeFormatSchema.safeParse("2026-01-01T00:00:00Z").success).toBe(
      true,
    );
  });

  it("rejects a plain date string without time", () => {
    expect(dateTimeFormatSchema.safeParse("2026-01-01").success).toBe(false);
  });
});

describe("contactDetailsSchema", () => {
  const valid = {
    title: "Civil Registry",
    telephoneNumber: "+12465551234",
    email: "registry@gov.bb",
  };

  it("accepts valid contact details", () => {
    expect(contactDetailsSchema.safeParse(valid).success).toBe(true);
  });

  it("rejects an invalid email address", () => {
    expect(
      contactDetailsSchema.safeParse({ ...valid, email: "not-an-email" })
        .success,
    ).toBe(false);
  });

  it("rejects when title is an empty string", () => {
    expect(
      contactDetailsSchema.safeParse({ ...valid, title: "" }).success,
    ).toBe(false);
  });
});

const validContract = {
  formId: "birth-cert",
  title: "Birth Certificate",
  steps: [
    {
      stepId: "step-1",
      title: "Personal Details",
      elements: [{ ref: "components/name" }],
    },
  ],
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
  version: "1.0.0",
};

describe("serviceContractSchema", () => {
  const validServiceContract = {
    formId: "birth-cert",
    title: "Birth Certificate",
    steps: [
      {
        stepId: "step-1",
        title: "Personal Details",
        elements: [{ ...validTextField, htmlType: "text" as const }],
      },
    ],
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    version: "1.0.0",
  };

  it("accepts a valid service contract", () => {
    expect(serviceContractSchema.safeParse(validServiceContract).success).toBe(
      true,
    );
  });

  it("rejects when formId is missing", () => {
    const { formId: _, ...rest } = validServiceContract;
    expect(serviceContractSchema.safeParse(rest).success).toBe(false);
  });
});

describe("serviceContractRecipeSchema", () => {
  it("accepts a valid recipe contract", () => {
    expect(serviceContractRecipeSchema.safeParse(validContract).success).toBe(
      true,
    );
  });

  it("rejects when createdAt is not a valid datetime", () => {
    expect(
      serviceContractRecipeSchema.safeParse({
        ...validContract,
        createdAt: "not-a-date",
      }).success,
    ).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// id-pattern exports
// ---------------------------------------------------------------------------

describe("KEBAB_ID_PATTERN (re-export)", () => {
  it("accepts a well-formed kebab id", () => {
    expect(KEBAB_ID_PATTERN.test("birth-registration")).toBe(true);
  });

  it("rejects a malformed id", () => {
    expect(KEBAB_ID_PATTERN.test("Foo-")).toBe(false);
  });
});

describe("KEBAB_ID_ERROR (re-export)", () => {
  it("is a non-empty string", () => {
    expect(KEBAB_ID_ERROR.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// validateFormContract
// ---------------------------------------------------------------------------

describe("validateFormContract", () => {
  it("returns ok: true for a valid recipe contract", () => {
    const result = validateFormContract(validContract);
    expect(result.ok).toBe(true);
  });

  it("returns ok: false and issues for an invalid contract", () => {
    const result = validateFormContract({ formId: 123 });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues.length).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------------------
// recipient-field exports (re-export path — detailed tests in recipient-field.spec.ts)
// ---------------------------------------------------------------------------

describe("classifyRecipientField (re-export)", () => {
  it("classifies a literal, contact, config, and submitted recipient", () => {
    expect(classifyRecipientField("a@b.bb")).toBe("literal");
    expect(classifyRecipientField(`${CONTACT_DETAILS_PREFIX}email`)).toBe(
      "contact",
    );
    expect(classifyRecipientField(`${CONFIG_RECIPIENT_PREFIX}mdaEmail`)).toBe(
      "config",
    );
    expect(classifyRecipientField("step.field")).toBe("submitted");
  });
});

describe("recipient prefix constants (re-export)", () => {
  it("expose the reserved prefixes", () => {
    expect(CONTACT_DETAILS_PREFIX).toBe("contactDetails.");
    expect(CONFIG_RECIPIENT_PREFIX).toBe("config.");
  });
});

// ---------------------------------------------------------------------------
// deploy-branch exports (re-export path — detailed tests in deploy-branch.spec.ts)
// ---------------------------------------------------------------------------

describe("deployBranchName / eraseBranchName (re-export)", () => {
  it("build dot-free branch names", () => {
    expect(deployBranchName("passport-renewal", "1.2.0")).not.toContain(".");
    expect(eraseBranchName("passport-renewal")).not.toContain(".");
  });
});
