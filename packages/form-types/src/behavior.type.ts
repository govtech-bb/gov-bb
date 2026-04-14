import { z } from "zod";

const operations = ["equal", "notEqual", "in", "exists"];

export const fieldConditionalOnBehaviourSchema = z.object({
  type: z.literal("fieldConditionalOn"),
  targetFieldId: z.string(),
  operator: z.enum(operations),
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
  operator: z.enum(operations),
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
