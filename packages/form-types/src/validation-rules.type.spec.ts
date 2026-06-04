import {
  afterRuleSchema,
  beforeRuleSchema,
  conditionalOnRuleSchema,
  emailRuleSchema,
  fileTypesRuleSchema,
  gtRuleSchema,
  itemMaxSizeRuleSchema,
  ltRuleSchema,
  maxItemsRuleSchema,
  maxLengthRuleSchema,
  maxRuleSchema,
  maxSizeRuleSchema,
  minItemsRuleSchema,
  minLengthRuleSchema,
  minRuleSchema,
  patternRuleSchema,
  requiredRuleSchema,
} from "./validation-rules.type";

// ---------------------------------------------------------------------------
// requiredRuleSchema
// ---------------------------------------------------------------------------

describe("requiredRuleSchema", () => {
  it("accepts a valid rule with value: true", () => {
    expect(requiredRuleSchema.safeParse({ value: true }).success).toBe(true);
  });

  it("accepts a valid rule with value: false", () => {
    expect(requiredRuleSchema.safeParse({ value: false }).success).toBe(true);
  });

  it("rejects when value is missing", () => {
    expect(requiredRuleSchema.safeParse({}).success).toBe(false);
  });

  it("accepts a custom error string", () => {
    expect(
      requiredRuleSchema.safeParse({
        value: true,
        error: "This field is required",
      }).success,
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// minLengthRuleSchema
// ---------------------------------------------------------------------------

describe("minLengthRuleSchema", () => {
  it("accepts a valid rule with numeric value", () => {
    expect(minLengthRuleSchema.safeParse({ value: 3 }).success).toBe(true);
  });

  it("rejects when value is a string", () => {
    expect(minLengthRuleSchema.safeParse({ value: "3" }).success).toBe(false);
  });

  it("rejects when value is missing", () => {
    expect(minLengthRuleSchema.safeParse({}).success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// maxLengthRuleSchema
// ---------------------------------------------------------------------------

describe("maxLengthRuleSchema", () => {
  it("accepts a valid rule with numeric value", () => {
    expect(maxLengthRuleSchema.safeParse({ value: 100 }).success).toBe(true);
  });

  it("rejects when value is a string", () => {
    expect(maxLengthRuleSchema.safeParse({ value: "100" }).success).toBe(false);
  });

  it("rejects when value is missing", () => {
    expect(maxLengthRuleSchema.safeParse({}).success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// patternRuleSchema
// ---------------------------------------------------------------------------

describe("patternRuleSchema", () => {
  it("accepts a valid rule with a regex string in `value` (#339)", () => {
    expect(
      patternRuleSchema.safeParse({ value: "^[A-Z]{2}\\d{6}$" }).success,
    ).toBe(true);
  });

  it("rejects when value is missing", () => {
    expect(patternRuleSchema.safeParse({}).success).toBe(false);
  });

  it("rejects when value is a non-string", () => {
    expect(patternRuleSchema.safeParse({ value: 123 }).success).toBe(false);
  });

  it("rejects the legacy `pattern` field name (#339)", () => {
    expect(patternRuleSchema.safeParse({ pattern: "^[A-Z]+$" }).success).toBe(
      false,
    );
  });
});

// ---------------------------------------------------------------------------
// emailRuleSchema
// ---------------------------------------------------------------------------

describe("emailRuleSchema", () => {
  it("accepts a valid rule with no extra fields required", () => {
    expect(emailRuleSchema.safeParse({}).success).toBe(true);
  });

  it("accepts a rule with a custom error string", () => {
    expect(
      emailRuleSchema.safeParse({ error: "Must be a valid email address" })
        .success,
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// minItemsRuleSchema
// ---------------------------------------------------------------------------

describe("minItemsRuleSchema", () => {
  it("accepts a valid rule with numeric value", () => {
    expect(minItemsRuleSchema.safeParse({ value: 1 }).success).toBe(true);
  });

  it("rejects when value is a string", () => {
    expect(minItemsRuleSchema.safeParse({ value: "1" }).success).toBe(false);
  });

  it("rejects when value is missing", () => {
    expect(minItemsRuleSchema.safeParse({}).success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// maxItemsRuleSchema
// ---------------------------------------------------------------------------

describe("maxItemsRuleSchema", () => {
  it("accepts a valid rule with numeric value", () => {
    expect(maxItemsRuleSchema.safeParse({ value: 5 }).success).toBe(true);
  });

  it("rejects when value is a string", () => {
    expect(maxItemsRuleSchema.safeParse({ value: "5" }).success).toBe(false);
  });

  it("rejects when value is missing", () => {
    expect(maxItemsRuleSchema.safeParse({}).success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// minRuleSchema
// ---------------------------------------------------------------------------

describe("minRuleSchema", () => {
  it("accepts a valid rule with numeric value", () => {
    expect(minRuleSchema.safeParse({ value: 0 }).success).toBe(true);
  });

  it("rejects when value is a string", () => {
    expect(minRuleSchema.safeParse({ value: "0" }).success).toBe(false);
  });

  it("accepts referenceFieldId", () => {
    expect(
      minRuleSchema.safeParse({ referenceFieldId: "start-amount" }).success,
    ).toBe(true);
  });

  it("accepts targetStepId", () => {
    expect(
      minRuleSchema.safeParse({ value: 10, targetStepId: "step-1" }).success,
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// maxRuleSchema
// ---------------------------------------------------------------------------

describe("maxRuleSchema", () => {
  it("accepts a valid rule with numeric value", () => {
    expect(maxRuleSchema.safeParse({ value: 999 }).success).toBe(true);
  });

  it("rejects when value is a string", () => {
    expect(maxRuleSchema.safeParse({ value: "999" }).success).toBe(false);
  });

  it("accepts referenceFieldId", () => {
    expect(
      maxRuleSchema.safeParse({ referenceFieldId: "end-amount" }).success,
    ).toBe(true);
  });

  it("accepts targetStepId", () => {
    expect(
      maxRuleSchema.safeParse({ value: 100, targetStepId: "step-2" }).success,
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// gtRuleSchema
// ---------------------------------------------------------------------------

describe("gtRuleSchema", () => {
  it("accepts a valid rule with numeric value", () => {
    expect(gtRuleSchema.safeParse({ value: 18 }).success).toBe(true);
  });

  it("rejects when value is a string", () => {
    expect(gtRuleSchema.safeParse({ value: "18" }).success).toBe(false);
  });

  it("accepts referenceFieldId", () => {
    expect(
      gtRuleSchema.safeParse({ referenceFieldId: "age-field" }).success,
    ).toBe(true);
  });

  it("accepts targetStepId", () => {
    expect(
      gtRuleSchema.safeParse({ value: 18, targetStepId: "eligibility-step" })
        .success,
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// ltRuleSchema
// ---------------------------------------------------------------------------

describe("ltRuleSchema", () => {
  it("accepts a valid rule with numeric value", () => {
    expect(ltRuleSchema.safeParse({ value: 65 }).success).toBe(true);
  });

  it("rejects when value is a string", () => {
    expect(ltRuleSchema.safeParse({ value: "65" }).success).toBe(false);
  });

  it("accepts referenceFieldId", () => {
    expect(
      ltRuleSchema.safeParse({ referenceFieldId: "retirement-age" }).success,
    ).toBe(true);
  });

  it("accepts targetStepId", () => {
    expect(
      ltRuleSchema.safeParse({ value: 65, targetStepId: "age-step" }).success,
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// fileTypesRuleSchema
// ---------------------------------------------------------------------------

describe("fileTypesRuleSchema", () => {
  it("accepts a valid array of MIME type strings", () => {
    expect(
      fileTypesRuleSchema.safeParse({
        value: ["image/jpeg", "application/pdf"],
      }).success,
    ).toBe(true);
  });

  it("rejects when value is not an array", () => {
    expect(fileTypesRuleSchema.safeParse({ value: "image/jpeg" }).success).toBe(
      false,
    );
  });

  it("rejects when value is missing", () => {
    expect(fileTypesRuleSchema.safeParse({}).success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// itemMaxSizeRuleSchema
// ---------------------------------------------------------------------------

describe("itemMaxSizeRuleSchema", () => {
  it("accepts a valid rule with numeric value", () => {
    expect(itemMaxSizeRuleSchema.safeParse({ value: 5242880 }).success).toBe(
      true,
    );
  });

  it("rejects when value is a string", () => {
    expect(itemMaxSizeRuleSchema.safeParse({ value: "5MB" }).success).toBe(
      false,
    );
  });

  it("rejects when value is missing", () => {
    expect(itemMaxSizeRuleSchema.safeParse({}).success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// maxSizeRuleSchema
// ---------------------------------------------------------------------------

describe("maxSizeRuleSchema", () => {
  it("accepts a valid rule with numeric value", () => {
    expect(maxSizeRuleSchema.safeParse({ value: 10485760 }).success).toBe(true);
  });

  it("rejects when value is a string", () => {
    expect(maxSizeRuleSchema.safeParse({ value: "10MB" }).success).toBe(false);
  });

  it("rejects when value is missing", () => {
    expect(maxSizeRuleSchema.safeParse({}).success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// afterRuleSchema
// ---------------------------------------------------------------------------

describe("afterRuleSchema", () => {
  it("accepts a valid rule with a date string value", () => {
    expect(afterRuleSchema.safeParse({ value: "2024-01-01" }).success).toBe(
      true,
    );
  });

  it("accepts referenceFieldId alongside targetStepId", () => {
    expect(
      afterRuleSchema.safeParse({
        referenceFieldId: "start-date",
        targetStepId: "dates-step",
      }).success,
    ).toBe(true);
  });

  it("accepts an empty object (all fields optional)", () => {
    expect(afterRuleSchema.safeParse({}).success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// beforeRuleSchema
// ---------------------------------------------------------------------------

describe("beforeRuleSchema", () => {
  it("accepts a valid rule with a date string value", () => {
    expect(beforeRuleSchema.safeParse({ value: "2026-12-31" }).success).toBe(
      true,
    );
  });

  it("accepts referenceFieldId alongside targetStepId", () => {
    expect(
      beforeRuleSchema.safeParse({
        referenceFieldId: "end-date",
        targetStepId: "dates-step",
      }).success,
    ).toBe(true);
  });

  it("accepts an empty object (all fields optional)", () => {
    expect(beforeRuleSchema.safeParse({}).success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// conditionalOnRuleSchema
// ---------------------------------------------------------------------------

describe("conditionalOnRuleSchema", () => {
  const valid = {
    targetFieldId: "country",
    operator: "equal",
    value: "BB",
  };

  it("accepts a valid conditionalOn rule", () => {
    expect(conditionalOnRuleSchema.safeParse(valid).success).toBe(true);
  });

  it("accepts a boolean value", () => {
    expect(
      conditionalOnRuleSchema.safeParse({ ...valid, value: true }).success,
    ).toBe(true);
  });

  it("accepts a numeric value", () => {
    expect(
      conditionalOnRuleSchema.safeParse({ ...valid, value: 42 }).success,
    ).toBe(true);
  });

  it("rejects when targetFieldId is missing", () => {
    const { targetFieldId: _f, ...noTarget } = valid;
    expect(conditionalOnRuleSchema.safeParse(noTarget).success).toBe(false);
  });

  it("rejects when operator is missing", () => {
    const { operator: _o, ...noOperator } = valid;
    expect(conditionalOnRuleSchema.safeParse(noOperator).success).toBe(false);
  });

  it("rejects when value is missing", () => {
    const { value: _v, ...noValue } = valid;
    expect(conditionalOnRuleSchema.safeParse(noValue).success).toBe(false);
  });
});
