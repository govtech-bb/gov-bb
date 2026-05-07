import { z } from "zod";

export const validationConfigSchema = z.object({
  error: z.string().optional(),
  value: z.any().optional(),
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

export const dateValueInputSchema = z.object({
  day: z.number().optional(),
  month: z.number().optional(),
  year: z.number().optional(),
});

export type DateValueInput = z.infer<typeof dateValueInputSchema>;

export interface DateValue {
  day: number;
  month: number;
  year: number;
}

export const fieldValueSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.array(z.union([z.string(), z.number(), z.boolean()])),
  dateValueInputSchema,
]);

export type FieldValue = z.infer<typeof fieldValueSchema>;
