// Kebab-case id enforcement (issues #741/#745): every stepId, fieldId and
// behaviour target must satisfy KEBAB_ID_PATTERN so the composite form-state
// key split (`${stepId}_${fieldId}`) can never be broken by an underscore in
// an id. These specs pin the rule at every schema position an id can enter.
import { formStepSchema, recipeBlockFieldSchema } from "./form-step.type";
import {
  basePrimitiveSchema,
  fieldOverridesSchema,
  textPrimitiveSchema,
} from "./primitive.type";
import {
  fieldConditionalOnBehaviourSchema,
  optionalIfBehaviourSchema,
  stepConditionalOnBehaviourSchema,
  sharedFieldsBehaviourSchema,
} from "./behavior.type";
import {
  afterRuleSchema,
  conditionalOnRuleSchema,
} from "./validation-rules.type";
import { KEBAB_ID_ERROR } from "./id-pattern";

const SNAKE = "previously_in_school";
const KEBAB = "previously-in-school";

const validStep = { stepId: KEBAB, title: "Previous schooling", elements: [] };
const validField = {
  fieldId: KEBAB,
  label: "Previously in school?",
  htmlType: "text",
};
const conditional = (target: Record<string, string>) => ({
  type: "fieldConditionalOn",
  operator: "equal",
  value: "yes",
  targetFieldId: KEBAB,
  ...target,
});

describe("kebab-case id enforcement", () => {
  describe("formStepSchema.stepId", () => {
    it("accepts a kebab-case stepId", () => {
      expect(formStepSchema.safeParse(validStep).success).toBe(true);
    });

    it("rejects a snake_case stepId with KEBAB_ID_ERROR", () => {
      const result = formStepSchema.safeParse({ ...validStep, stepId: SNAKE });
      expect(result.success).toBe(false);
      expect(result.error?.issues[0]?.message).toBe(KEBAB_ID_ERROR);
      expect(result.error?.issues[0]?.path).toEqual(["stepId"]);
    });
  });

  describe("basePrimitiveSchema.fieldId", () => {
    it("accepts a kebab-case fieldId", () => {
      expect(basePrimitiveSchema.safeParse(validField).success).toBe(true);
    });

    it("rejects a snake_case fieldId with KEBAB_ID_ERROR", () => {
      const result = basePrimitiveSchema.safeParse({
        ...validField,
        fieldId: SNAKE,
      });
      expect(result.success).toBe(false);
      expect(result.error?.issues[0]?.message).toBe(KEBAB_ID_ERROR);
    });

    it("is inherited by the concrete primitives", () => {
      const result = textPrimitiveSchema.safeParse({
        ...validField,
        fieldId: SNAKE,
      });
      expect(result.success).toBe(false);
    });
  });

  describe("fieldOverridesSchema.fieldId (recipe overrides)", () => {
    it("accepts an absent fieldId", () => {
      expect(fieldOverridesSchema.safeParse({ label: "Hi" }).success).toBe(
        true,
      );
    });

    it("accepts a kebab-case fieldId", () => {
      expect(fieldOverridesSchema.safeParse({ fieldId: KEBAB }).success).toBe(
        true,
      );
    });

    it("rejects a snake_case fieldId with KEBAB_ID_ERROR", () => {
      const result = fieldOverridesSchema.safeParse({ fieldId: SNAKE });
      expect(result.success).toBe(false);
      expect(result.error?.issues[0]?.message).toBe(KEBAB_ID_ERROR);
    });
  });

  describe("behaviour targets", () => {
    it.each([
      ["fieldConditionalOn", fieldConditionalOnBehaviourSchema],
      ["optionalIf", optionalIfBehaviourSchema],
    ] as const)("%s rejects a snake_case targetFieldId", (type, schema) => {
      const result = schema.safeParse({
        ...conditional({}),
        type,
        targetFieldId: SNAKE,
      });
      expect(result.success).toBe(false);
      expect(result.error?.issues[0]?.message).toBe(KEBAB_ID_ERROR);
    });

    it.each([
      ["fieldConditionalOn", fieldConditionalOnBehaviourSchema],
      ["optionalIf", optionalIfBehaviourSchema],
    ] as const)("%s rejects a snake_case targetStepId", (type, schema) => {
      const result = schema.safeParse({
        ...conditional({ targetStepId: SNAKE }),
        type,
      });
      expect(result.success).toBe(false);
      expect(result.error?.issues[0]?.message).toBe(KEBAB_ID_ERROR);
    });

    it("stepConditionalOn rejects snake_case targets", () => {
      const base = {
        ...conditional({ targetStepId: KEBAB }),
        type: "stepConditionalOn",
      };
      expect(stepConditionalOnBehaviourSchema.safeParse(base).success).toBe(
        true,
      );
      expect(
        stepConditionalOnBehaviourSchema.safeParse({
          ...base,
          targetFieldId: SNAKE,
        }).success,
      ).toBe(false);
      expect(
        stepConditionalOnBehaviourSchema.safeParse({
          ...base,
          targetStepId: SNAKE,
        }).success,
      ).toBe(false);
    });

    it("sharedFields rejects a snake_case entry in fieldIds", () => {
      const valid = { type: "sharedFields", fieldIds: [KEBAB] };
      expect(sharedFieldsBehaviourSchema.safeParse(valid).success).toBe(true);
      const result = sharedFieldsBehaviourSchema.safeParse({
        type: "sharedFields",
        fieldIds: [KEBAB, SNAKE],
      });
      expect(result.success).toBe(false);
      expect(result.error?.issues[0]?.message).toBe(KEBAB_ID_ERROR);
    });

    it("accepts kebab-case targets", () => {
      expect(
        fieldConditionalOnBehaviourSchema.safeParse(
          conditional({ targetStepId: KEBAB }),
        ).success,
      ).toBe(true);
    });
  });

  describe("validation-rule id references", () => {
    it("conditionalOn rule rejects a snake_case targetFieldId", () => {
      const rule = { targetFieldId: KEBAB, operator: "equal", value: "yes" };
      expect(conditionalOnRuleSchema.safeParse(rule).success).toBe(true);
      const result = conditionalOnRuleSchema.safeParse({
        ...rule,
        targetFieldId: SNAKE,
      });
      expect(result.success).toBe(false);
      expect(result.error?.issues[0]?.message).toBe(KEBAB_ID_ERROR);
    });

    it("reference fields reject snake_case ids", () => {
      expect(
        afterRuleSchema.safeParse({
          referenceFieldId: KEBAB,
          targetStepId: KEBAB,
        }).success,
      ).toBe(true);
      expect(
        afterRuleSchema.safeParse({ referenceFieldId: SNAKE }).success,
      ).toBe(false);
      expect(afterRuleSchema.safeParse({ targetStepId: SNAKE }).success).toBe(
        false,
      );
    });
  });

  describe("recipeBlockFieldSchema override keys (child fieldIds)", () => {
    it("accepts kebab-case keys", () => {
      const block = {
        ref: "blocks/full-name",
        overrides: { [KEBAB]: { label: "Hi" } },
      };
      expect(recipeBlockFieldSchema.safeParse(block).success).toBe(true);
    });

    it("rejects a snake_case key, naming the key in the issue path", () => {
      const block = {
        ref: "blocks/full-name",
        overrides: { [SNAKE]: { label: "Hi" } },
      };
      const result = recipeBlockFieldSchema.safeParse(block);
      expect(result.success).toBe(false);
      // Zod wraps record-key failures: the top-level issue is "Invalid key in
      // record" with the offending key in its path; KEBAB_ID_ERROR sits in the
      // nested issue list.
      const issue = result.error?.issues[0] as {
        path: unknown[];
        issues?: { message: string }[];
      };
      expect(issue.path).toEqual(["overrides", SNAKE]);
      expect(issue.issues?.[0]?.message).toBe(KEBAB_ID_ERROR);
    });
  });
});
