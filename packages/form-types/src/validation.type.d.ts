import { z } from "zod";
export declare const validationConfigSchema: z.ZodObject<
  {
    error: z.ZodOptional<z.ZodString>;
    value: z.ZodOptional<z.ZodAny>;
    reference: z.ZodOptional<z.ZodString>;
    targetStepId: z.ZodOptional<z.ZodString>;
  },
  z.core.$strip
>;
export type ValidationConfig = z.infer<typeof validationConfigSchema>;
export declare const validationTypeSchema: z.ZodEnum<{
  required: "required";
  pattern: "pattern";
  maxLength: "maxLength";
  minLength: "minLength";
  maxItems: "maxItems";
  minItems: "minItems";
  equal: "equal";
  notEqual: "notEqual";
  min: "min";
  max: "max";
  conditionalOn: "conditionalOn";
  past: "past";
  pastOrToday: "pastOrToday";
  future: "future";
  futureOrToday: "futureOrToday";
  after: "after";
  before: "before";
  onOrAfter: "onOrAfter";
  onOrBefore: "onOrBefore";
  minYear: "minYear";
  maxYear: "maxYear";
  radio: "radio";
  minSelection: "minSelection";
  maxSelection: "maxSelection";
  email: "email";
  fileTypes: "fileTypes";
  itemMaxSize: "itemMaxSize";
  maxSize: "maxSize";
  gt: "gt";
  lt: "lt";
  contains: "contains";
  strictEquality: "strictEquality";
}>;
export type ValidationType = z.infer<typeof validationTypeSchema>;
export declare const validationRuleSchema: z.ZodRecord<
  z.ZodEnum<{
    required: "required";
    pattern: "pattern";
    maxLength: "maxLength";
    minLength: "minLength";
    maxItems: "maxItems";
    minItems: "minItems";
    equal: "equal";
    notEqual: "notEqual";
    min: "min";
    max: "max";
    conditionalOn: "conditionalOn";
    past: "past";
    pastOrToday: "pastOrToday";
    future: "future";
    futureOrToday: "futureOrToday";
    after: "after";
    before: "before";
    onOrAfter: "onOrAfter";
    onOrBefore: "onOrBefore";
    minYear: "minYear";
    maxYear: "maxYear";
    radio: "radio";
    minSelection: "minSelection";
    maxSelection: "maxSelection";
    email: "email";
    fileTypes: "fileTypes";
    itemMaxSize: "itemMaxSize";
    maxSize: "maxSize";
    gt: "gt";
    lt: "lt";
    contains: "contains";
    strictEquality: "strictEquality";
  }> &
    z.core.$partial,
  z.ZodObject<
    {
      error: z.ZodOptional<z.ZodString>;
      value: z.ZodOptional<z.ZodAny>;
      reference: z.ZodOptional<z.ZodString>;
      targetStepId: z.ZodOptional<z.ZodString>;
    },
    z.core.$strip
  >
>;
export type ValidationRule = z.infer<typeof validationRuleSchema>;
