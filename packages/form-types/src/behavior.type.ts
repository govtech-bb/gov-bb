import { z } from "zod";
import { kebabIdSchema } from "./id-pattern";

const operationValues = [
  "equal",
  "notEqual",
  "in",
  "exists",
  // Numeric comparison operators (#1020). Both sides are coerced to Number;
  // NaN on either side never matches. Ranges compose through the implicit AND
  // across stacked conditions (gte 16 + lte 24 → "16–24"), so no fused range
  // operator is needed.
  "gte",
  "lte",
  "gt",
  "lt",
] as const;

export const equalityOperationsSchema = z.enum(operationValues);
export type EqualityOperations = z.infer<typeof equalityOperationsSchema>;

// Optional date→number derivation (#1020), shared by the branch (conditional)
// and block (validation) engines. When set, the date value is passed through
// `durationSince` (Barbados tz, truncated whole integer) before the operator /
// numeric rule runs — so a form can gate on an age derived from a
// date-of-birth field. Invalid/empty date → NaN → no match / validation-fail.
export const durationTransformSchema = z.enum([
  "yearsSince",
  "monthsSince",
  "daysSince",
]);
export type DurationTransform = z.infer<typeof durationTransformSchema>;

export const fieldConditionalOnBehaviourSchema = z.object({
  type: z.literal("fieldConditionalOn"),
  // Targets name a fieldId/stepId, so they inherit the kebab-case id rule.
  targetFieldId: kebabIdSchema,
  targetStepId: kebabIdSchema.optional(),
  operator: equalityOperationsSchema,
  transform: durationTransformSchema.optional(),
  value: z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.array(z.string()),
    z.array(z.number()),
  ]),
});
export type FieldConditionalOnBehaviour = z.infer<
  typeof fieldConditionalOnBehaviourSchema
>;

// Like `fieldConditionalOn`, but relaxes `required` instead of toggling
// visibility: when the condition matches, the field becomes optional; the
// field is never hidden. Format rules still apply whenever it is filled.
export const optionalIfBehaviourSchema = z.object({
  type: z.literal("optionalIf"),
  targetFieldId: kebabIdSchema,
  targetStepId: kebabIdSchema.optional(),
  operator: equalityOperationsSchema,
  transform: durationTransformSchema.optional(),
  value: z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.array(z.string()),
    z.array(z.number()),
  ]),
});
export type OptionalIfBehaviour = z.infer<typeof optionalIfBehaviourSchema>;

export const stepConditionalOnBehaviourSchema = z.object({
  type: z.literal("stepConditionalOn"),
  targetFieldId: kebabIdSchema,
  targetStepId: kebabIdSchema,
  operator: equalityOperationsSchema,
  transform: durationTransformSchema.optional(),
  value: z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.array(z.string()),
    z.array(z.number()),
  ]),
});
export type StepConditionalOnBehaviour = z.infer<
  typeof stepConditionalOnBehaviourSchema
>;

export const repeatableBehaviourSchema = z.object({
  type: z.literal("repeatable"),
  min: z.number(),
  max: z.number(),
  // Optional override for the auto-generated "Add another?" radio label, so a
  // recipe can phrase it per step (e.g. "Do you want to add another
  // qualification?"). Falls back to "Add another?" when omitted.
  addAnotherLabel: z.string().min(1).optional(),
  // Optional noun used to mark repeat instances beyond the first (e.g.
  // "Dependent" renders instance 2 as "Dependent 2"). When omitted, instances
  // beyond the first are auto-numbered against the step title.
  instanceLabel: z.string().min(1).optional(),
});
export type RepeatableBehaviour = z.infer<typeof repeatableBehaviourSchema>;

export const fieldArrayBehaviourSchema = z.object({
  type: z.literal("fieldArray"),
  min: z.number(),
  max: z.number(),
});
export type FieldArrayBehaviour = z.infer<typeof fieldArrayBehaviourSchema>;

export const sharedFieldsBehaviourSchema = z.object({
  type: z.literal("sharedFields"),
  fieldIds: z.array(kebabIdSchema),
});
export type SharedFieldsBehaviour = z.infer<typeof sharedFieldsBehaviourSchema>;

export const behaviourSchema = z.discriminatedUnion("type", [
  fieldConditionalOnBehaviourSchema,
  optionalIfBehaviourSchema,
  stepConditionalOnBehaviourSchema,
  repeatableBehaviourSchema,
  fieldArrayBehaviourSchema,
  sharedFieldsBehaviourSchema,
]);
export type Behaviour = z.infer<typeof behaviourSchema>;
