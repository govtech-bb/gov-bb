import { z } from "zod";
import { kebabIdSchema } from "./id-pattern";

const operationValues = ["equal", "notEqual", "in", "exists"] as const;

export const equalityOperationsSchema = z.enum(operationValues);
export type EqualityOperations = z.infer<typeof equalityOperationsSchema>;

export const fieldConditionalOnBehaviourSchema = z.object({
  type: z.literal("fieldConditionalOn"),
  // Targets name a fieldId/stepId, so they inherit the kebab-case id rule.
  targetFieldId: kebabIdSchema,
  targetStepId: kebabIdSchema.optional(),
  operator: equalityOperationsSchema,
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
