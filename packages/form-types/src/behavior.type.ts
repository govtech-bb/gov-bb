import { z } from "zod";

const operationValues = ["equal", "notEqual", "in", "exists"] as const;

export const equalityOperationsSchema = z.enum(operationValues);
export type EqualityOperations = z.infer<typeof equalityOperationsSchema>;

export const fieldConditionalOnBehaviourSchema = z.object({
  type: z.literal("fieldConditionalOn"),
  targetFieldId: z.string(),
  targetStepId: z.string().optional(),
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

export const stepConditionalOnBehaviourSchema = z.object({
  type: z.literal("stepConditionalOn"),
  targetFieldId: z.string(),
  targetStepId: z.string().optional(),
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
  fieldIds: z.array(z.string()),
});
export type SharedFieldsBehaviour = z.infer<typeof sharedFieldsBehaviourSchema>;

export const behaviourSchema = z.discriminatedUnion("type", [
  fieldConditionalOnBehaviourSchema,
  stepConditionalOnBehaviourSchema,
  repeatableBehaviourSchema,
  fieldArrayBehaviourSchema,
  sharedFieldsBehaviourSchema,
]);
export type Behaviour = z.infer<typeof behaviourSchema>;
