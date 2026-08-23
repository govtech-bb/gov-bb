import {
  draftRecipeSchema,
  serviceContractRecipeSchema,
  serviceContractSchema,
} from "./service-contract.type";
import { normalizeRuleValues, validationRuleSchema } from "./validation.type";

// #2384: `validationConfigSchema.value` is `z.any()` — one loose shape shared
// by every rule type — so a builder-authored comma string sailed through as
// `fileTypes.value` and reached the forms renderer, where
// `rawFileTypes.map(...)` threw "map is not a function" and the error boundary
// swallowed the whole step.
//
// The strict per-rule contract is enforced on RECIPES only. The served
// contract must stay tolerant: `apps/forms` hard-parses every API response
// with `serviceContractSchema.parse(...)`, so rejecting there would blank the
// entire form — and would break the moment a new frontend met an API still
// serving an older recipe.

const recipeWith = (validations: unknown) => ({
  formId: "test-form",
  title: "Test form",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  steps: [
    {
      stepId: "step-one",
      title: "Step one",
      elements: [
        { ref: "components/generic-text", overrides: { validations } },
      ],
    },
  ],
});

const contractWith = (validations: unknown) => ({
  formId: "test-form",
  title: "Test form",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  steps: [
    {
      stepId: "step-one",
      title: "Step one",
      elements: [
        {
          fieldId: "a-field",
          htmlType: "file",
          label: "A field",
          multiple: false,
          validations,
        },
      ],
    },
  ],
});

describe("recipe schema rejects off-shape rule values (#2384)", () => {
  it("rejects fileTypes authored as a comma-separated string", () => {
    const result = serviceContractRecipeSchema.safeParse(
      recipeWith({ fileTypes: { value: "application/pdf,image/png" } }),
    );
    expect(result.success).toBe(false);
    expect(result.error!.issues[0]!.message).toContain("fileTypes.value");
  });

  it("accepts fileTypes as an array of strings", () => {
    expect(
      serviceContractRecipeSchema.safeParse(
        recipeWith({ fileTypes: { value: ["application/pdf", "image/png"] } }),
      ).success,
    ).toBe(true);
  });

  it.each([
    "itemMaxSize",
    "maxSize",
    "minItems",
    "maxItems",
    "minLength",
    "maxLength",
    "gt",
    "lt",
  ])("rejects a numeric string for %s", (rule) => {
    expect(
      serviceContractRecipeSchema.safeParse(
        recipeWith({ [rule]: { value: "5" } }),
      ).success,
    ).toBe(false);
  });

  it.each(["itemMaxSize", "minItems", "minLength", "gt"])(
    "accepts a number for %s",
    (rule) => {
      expect(
        serviceContractRecipeSchema.safeParse(
          recipeWith({ [rule]: { value: 5 } }),
        ).success,
      ).toBe(true);
    },
  );

  it("still accepts a rule bound by referenceFieldId instead of a value", () => {
    expect(
      serviceContractRecipeSchema.safeParse(
        recipeWith({ gt: { referenceFieldId: "other-field" } }),
      ).success,
    ).toBe(true);
  });

  it("leaves deliberately loose rules alone", () => {
    expect(
      serviceContractRecipeSchema.safeParse(
        recipeWith({
          pattern: { value: "^[0-9]+$" },
          equal: { value: "yes" },
          required: { error: "Required" },
        }),
      ).success,
    ).toBe(true);
  });

  it("reports the path to the offending rule", () => {
    const result = serviceContractRecipeSchema.safeParse(
      recipeWith({ fileTypes: { value: "application/pdf" } }),
    );
    expect(result.error!.issues[0]!.path).toEqual([
      "steps",
      0,
      "elements",
      0,
      "overrides",
      "validations",
    ]);
  });

  // A block element carries a fieldId -> FieldOverrides map rather than one
  // FieldOverrides, so the walk has to descend a level further.
  it("rejects an off-shape value inside a block element's per-field overrides", () => {
    const result = serviceContractRecipeSchema.safeParse({
      formId: "test-form",
      title: "Test form",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      steps: [
        {
          stepId: "step-one",
          title: "Step one",
          elements: [
            {
              ref: "blocks/proving-your-identity",
              overrides: {
                "id-document": {
                  validations: { fileTypes: { value: "application/pdf" } },
                },
              },
            },
          ],
        },
      ],
    });
    expect(result.success).toBe(false);
    expect(result.error!.issues[0]!.path).toEqual([
      "steps",
      0,
      "elements",
      0,
      "overrides",
      "id-document",
      "validations",
    ]);
  });

  it("accepts an element whose overrides carry no validations at all", () => {
    expect(
      serviceContractRecipeSchema.safeParse({
        formId: "test-form",
        title: "Test form",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
        steps: [
          {
            stepId: "step-one",
            title: "Step one",
            elements: [
              {
                ref: "components/generic-text",
                overrides: { label: "Just a relabel" },
              },
            ],
          },
        ],
      }).success,
    ).toBe(true);
  });

  it("applies to the builder's draft-save gate too", () => {
    expect(
      draftRecipeSchema.safeParse(
        recipeWith({ fileTypes: { value: "application/pdf,image/png" } }),
      ).success,
    ).toBe(false);
  });
});

describe("served contract stays tolerant of off-shape rule values (#2384)", () => {
  // apps/forms does `serviceContractSchema.parse(body.data)` on every response.
  // A strict parse here blanks the whole form instead of one field, and breaks
  // any frontend newer than the API it is talking to. Bad values are
  // normalised at the point of use (see apps/forms file-upload.tsx).
  it("accepts a comma-separated fileTypes string from the API", () => {
    expect(
      serviceContractSchema.safeParse(
        contractWith({ fileTypes: { value: "application/pdf,image/png" } }),
      ).success,
    ).toBe(true);
  });

  it("accepts a numeric string from the API", () => {
    expect(
      serviceContractSchema.safeParse(
        contractWith({ itemMaxSize: { value: "5242880" } }),
      ).success,
    ).toBe(true);
  });

  it("keeps validationRuleSchema itself loose", () => {
    expect(
      validationRuleSchema.safeParse({
        fileTypes: { value: "application/pdf,image/png" },
      }).success,
    ).toBe(true);
  });
});

describe("normalizeRuleValues (#2384)", () => {
  it("splits a comma-separated fileTypes string into an array", () => {
    expect(
      normalizeRuleValues({
        fileTypes: { value: "application/pdf, image/png" },
      }),
    ).toEqual({ fileTypes: { value: ["application/pdf", "image/png"] } });
  });

  it("converts a numeric string to a number", () => {
    expect(normalizeRuleValues({ itemMaxSize: { value: "5242880" } })).toEqual({
      itemMaxSize: { value: 5242880 },
    });
  });

  it("keeps the rest of the rule config intact", () => {
    expect(
      normalizeRuleValues({ minLength: { value: "5", error: "Too short." } }),
    ).toEqual({ minLength: { value: 5, error: "Too short." } });
  });

  it("leaves an already-valid value untouched", () => {
    const rules = {
      itemMaxSize: { value: 5242880 },
      fileTypes: { value: ["application/pdf"] },
    };
    expect(normalizeRuleValues(rules)).toEqual(rules);
  });

  it("leaves rules with no pinned shape untouched", () => {
    const rules = { equal: { value: "yes" } };
    expect(normalizeRuleValues(rules)).toEqual(rules);
  });

  it("leaves a rule carrying no value untouched", () => {
    const rules = { gt: { referenceFieldId: "other-field" } };
    expect(normalizeRuleValues(rules)).toEqual(rules);
  });

  // Coercing these would store NaN and hide the problem; leaving them alone
  // lets the recipe schema report them by name instead.
  it("leaves an uncoercible numeric string alone", () => {
    expect(normalizeRuleValues({ minLength: { value: "abc" } })).toEqual({
      minLength: { value: "abc" },
    });
  });

  it("leaves an empty string alone", () => {
    expect(normalizeRuleValues({ minLength: { value: "   " } })).toEqual({
      minLength: { value: "   " },
    });
  });

  it("leaves an off-shape non-string value alone", () => {
    expect(normalizeRuleValues({ fileTypes: { value: 123 } })).toEqual({
      fileTypes: { value: 123 },
    });
  });

  it("output of a normalised recipe passes the recipe gate", () => {
    const normalized = normalizeRuleValues({
      itemMaxSize: { value: "5242880" },
    });
    expect(
      serviceContractRecipeSchema.safeParse(recipeWith(normalized)).success,
    ).toBe(true);
  });
});
