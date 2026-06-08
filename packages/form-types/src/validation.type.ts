import { z } from "zod";

export const validationConfigSchema = z.object({
  error: z.string().optional(),
  value: z.any().optional(),
  targetStepId: z.string().optional(),
  referenceFieldId: z.string().optional(),
  referenceStepId: z.string().optional(),
  // When true on a `minYear`/`maxYear` rule, the bound resolves to the current
  // year at validation time instead of a literal `value` — e.g. a "Year" field
  // that must not be in the future. Resolved fresh on every run, so it never
  // goes stale the way a hardcoded year would.
  currentYear: z.boolean().optional(),
  // Shifts the resolved reference date forward by N calendar months on the
  // cross-field date rules (`after`/`before`/`onOrAfter`/`onOrBefore`), so the
  // bound becomes "reference + N months" — e.g. an end date that must be on or
  // before the start date plus 6 months. Day-of-month clamps to the target
  // month's last day (31 Aug + 6 → 28/29 Feb). Ignored by non-date rules.
  offsetMonths: z.number().optional(),
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
  "phone",
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

// Date parts are migrating from numbers to the literal digit-string the user
// typed (so "09" no longer collapses to "9" and "00" stays distinct from "0").
// Because the forms frontend and the API deploy separately, the shape is
// tolerated as EITHER during the migration window: the validation boundary in
// `@govtech-bb/form-validation` coerces both to a number where arithmetic is
// needed (ADR 0040 / 0043). The frontend flips to emitting strings in a later
// deploy. See issue #815.
export const dateValueInputSchema = z.object({
  day: z.union([z.number(), z.string()]).optional(),
  month: z.union([z.number(), z.string()]).optional(),
  year: z.union([z.number(), z.string()]).optional(),
});

export type DateValueInput = z.infer<typeof dateValueInputSchema>;

export interface DateValue {
  day: string | number;
  month: string | number;
  year: string | number;
}

export const fieldValueSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.array(z.union([z.string(), z.number(), z.boolean()])),
  dateValueInputSchema,
]);

export type FieldValue = z.infer<typeof fieldValueSchema>;
