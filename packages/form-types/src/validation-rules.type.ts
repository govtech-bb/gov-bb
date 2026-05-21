import { z } from "zod";

// ---------------------------------------------------------------------------
// Shared optional base fields present on many rule schemas
// ---------------------------------------------------------------------------

const baseRuleFields = {
  error: z.string().optional(),
};

const referenceFields = {
  referenceFieldId: z.string().optional(),
  targetStepId: z.string().optional(),
};

// ---------------------------------------------------------------------------
// Individual validation rule schemas
// ---------------------------------------------------------------------------

export const requiredRuleSchema = z.object({
  ...baseRuleFields,
  value: z.boolean(),
});
export type RequiredRule = z.infer<typeof requiredRuleSchema>;

export const minLengthRuleSchema = z.object({
  ...baseRuleFields,
  value: z.number(),
});
export type MinLengthRule = z.infer<typeof minLengthRuleSchema>;

export const maxLengthRuleSchema = z.object({
  ...baseRuleFields,
  value: z.number(),
});
export type MaxLengthRule = z.infer<typeof maxLengthRuleSchema>;

export const patternRuleSchema = z.object({
  ...baseRuleFields,
  pattern: z.string(),
});
export type PatternRule = z.infer<typeof patternRuleSchema>;

export const emailRuleSchema = z.object({
  ...baseRuleFields,
});
export type EmailRule = z.infer<typeof emailRuleSchema>;

export const minItemsRuleSchema = z.object({
  ...baseRuleFields,
  value: z.number(),
});
export type MinItemsRule = z.infer<typeof minItemsRuleSchema>;

export const maxItemsRuleSchema = z.object({
  ...baseRuleFields,
  value: z.number(),
});
export type MaxItemsRule = z.infer<typeof maxItemsRuleSchema>;

export const minRuleSchema = z.object({
  ...baseRuleFields,
  ...referenceFields,
  value: z.number().optional(),
});
export type MinRule = z.infer<typeof minRuleSchema>;

export const maxRuleSchema = z.object({
  ...baseRuleFields,
  ...referenceFields,
  value: z.number().optional(),
});
export type MaxRule = z.infer<typeof maxRuleSchema>;

export const gtRuleSchema = z.object({
  ...baseRuleFields,
  ...referenceFields,
  value: z.number().optional(),
});
export type GtRule = z.infer<typeof gtRuleSchema>;

export const ltRuleSchema = z.object({
  ...baseRuleFields,
  ...referenceFields,
  value: z.number().optional(),
});
export type LtRule = z.infer<typeof ltRuleSchema>;

export const fileTypesRuleSchema = z.object({
  ...baseRuleFields,
  value: z.array(z.string()),
});
export type FileTypesRule = z.infer<typeof fileTypesRuleSchema>;

export const itemMaxSizeRuleSchema = z.object({
  ...baseRuleFields,
  value: z.number(),
});
export type ItemMaxSizeRule = z.infer<typeof itemMaxSizeRuleSchema>;

export const maxSizeRuleSchema = z.object({
  ...baseRuleFields,
  value: z.number(),
});
export type MaxSizeRule = z.infer<typeof maxSizeRuleSchema>;

export const afterRuleSchema = z.object({
  ...baseRuleFields,
  ...referenceFields,
  value: z.string().optional(),
});
export type AfterRule = z.infer<typeof afterRuleSchema>;

export const beforeRuleSchema = z.object({
  ...baseRuleFields,
  ...referenceFields,
  value: z.string().optional(),
});
export type BeforeRule = z.infer<typeof beforeRuleSchema>;

export const conditionalOnRuleSchema = z.object({
  ...baseRuleFields,
  targetFieldId: z.string(),
  operator: z.string(),
  value: z.union([z.string(), z.number(), z.boolean()]),
});
export type ConditionalOnRule = z.infer<typeof conditionalOnRuleSchema>;
