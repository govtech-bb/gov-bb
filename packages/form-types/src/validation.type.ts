import { z } from "zod";

export const validationConfigSchema = z.object({
  error: z.string().optional(),
  value: z.any().optional(),
  reference: z.string().optional(),
  targetStepId: z.string().optional(),
  referenceFieldId: z.string().optional(),
  referenceStepId: z.string().optional(),
});
export type ValidationConfig = z.infer<typeof validationConfigSchema>;

export const validationTypeSchema = z.enum([
  "required",
  "minLength",
  "maxLength",
  "pattern",
  "min",
  "max",
  "conditionalOn",
  "past",
  "pastOrToday",
  "future",
  "futureOrToday",
  "after",
  "before",
  "onOrAfter",
  "onOrBefore",
  "minYear",
  "maxYear",
  "minItems",
  "maxItems",
  "radio",
  "minSelection",
  "maxSelection",
  "email",
  "fileTypes",
  "itemMaxSize",
  "maxSize",
  "equal",
  "notEqual",
  "gt",
  "lt",
  "contains",
  "strictEquality",
]);
export type ValidationType = z.infer<typeof validationTypeSchema>;

export const validationRuleSchema = z.partialRecord(
  validationTypeSchema,
  validationConfigSchema,
);
export type ValidationRule = z.infer<typeof validationRuleSchema>;
