import { z } from "zod";
export declare const equalityOperationsSchema: z.ZodEnum<{
  equal: "equal";
  notEqual: "notEqual";
  in: "in";
  exists: "exists";
}>;
export type EqualityOperations = z.infer<typeof equalityOperationsSchema>;
export declare const fieldConditionalOnBehaviourSchema: z.ZodObject<
  {
    type: z.ZodLiteral<"fieldConditionalOn">;
    targetFieldId: z.ZodString;
    targetStepId: z.ZodOptional<z.ZodString>;
    operator: z.ZodEnum<{
      equal: "equal";
      notEqual: "notEqual";
      in: "in";
      exists: "exists";
    }>;
    value: z.ZodUnion<
      readonly [
        z.ZodString,
        z.ZodNumber,
        z.ZodBoolean,
        z.ZodArray<z.ZodString>,
        z.ZodArray<z.ZodNumber>,
      ]
    >;
  },
  z.core.$strip
>;
export type FieldConditionalOnBehaviour = z.infer<
  typeof fieldConditionalOnBehaviourSchema
>;
export declare const stepConditionalOnBehaviourSchema: z.ZodObject<
  {
    type: z.ZodLiteral<"stepConditionalOn">;
    targetFieldId: z.ZodString;
    targetStepId: z.ZodOptional<z.ZodString>;
    operator: z.ZodEnum<{
      equal: "equal";
      notEqual: "notEqual";
      in: "in";
      exists: "exists";
    }>;
    value: z.ZodUnion<
      readonly [
        z.ZodString,
        z.ZodNumber,
        z.ZodBoolean,
        z.ZodArray<z.ZodString>,
        z.ZodArray<z.ZodNumber>,
      ]
    >;
  },
  z.core.$strip
>;
export type StepConditionalOnBehaviour = z.infer<
  typeof stepConditionalOnBehaviourSchema
>;
export declare const repeatableBehaviourSchema: z.ZodObject<
  {
    type: z.ZodLiteral<"repeatable">;
    min: z.ZodNumber;
    max: z.ZodNumber;
  },
  z.core.$strip
>;
export type RepeatableBehaviour = z.infer<typeof repeatableBehaviourSchema>;
export declare const fieldArrayBehaviourSchema: z.ZodObject<
  {
    type: z.ZodLiteral<"fieldArray">;
    min: z.ZodNumber;
    max: z.ZodNumber;
  },
  z.core.$strip
>;
export type FieldArrayBehaviour = z.infer<typeof fieldArrayBehaviourSchema>;
export declare const sharedFieldsBehaviourSchema: z.ZodObject<
  {
    type: z.ZodLiteral<"sharedFields">;
    fieldIds: z.ZodArray<z.ZodString>;
  },
  z.core.$strip
>;
export type SharedFieldsBehaviour = z.infer<typeof sharedFieldsBehaviourSchema>;
export declare const behaviourSchema: z.ZodDiscriminatedUnion<
  [
    z.ZodObject<
      {
        type: z.ZodLiteral<"fieldConditionalOn">;
        targetFieldId: z.ZodString;
        targetStepId: z.ZodOptional<z.ZodString>;
        operator: z.ZodEnum<{
          equal: "equal";
          notEqual: "notEqual";
          in: "in";
          exists: "exists";
        }>;
        value: z.ZodUnion<
          readonly [
            z.ZodString,
            z.ZodNumber,
            z.ZodBoolean,
            z.ZodArray<z.ZodString>,
            z.ZodArray<z.ZodNumber>,
          ]
        >;
      },
      z.core.$strip
    >,
    z.ZodObject<
      {
        type: z.ZodLiteral<"stepConditionalOn">;
        targetFieldId: z.ZodString;
        targetStepId: z.ZodOptional<z.ZodString>;
        operator: z.ZodEnum<{
          equal: "equal";
          notEqual: "notEqual";
          in: "in";
          exists: "exists";
        }>;
        value: z.ZodUnion<
          readonly [
            z.ZodString,
            z.ZodNumber,
            z.ZodBoolean,
            z.ZodArray<z.ZodString>,
            z.ZodArray<z.ZodNumber>,
          ]
        >;
      },
      z.core.$strip
    >,
    z.ZodObject<
      {
        type: z.ZodLiteral<"repeatable">;
        min: z.ZodNumber;
        max: z.ZodNumber;
      },
      z.core.$strip
    >,
    z.ZodObject<
      {
        type: z.ZodLiteral<"fieldArray">;
        min: z.ZodNumber;
        max: z.ZodNumber;
      },
      z.core.$strip
    >,
    z.ZodObject<
      {
        type: z.ZodLiteral<"sharedFields">;
        fieldIds: z.ZodArray<z.ZodString>;
      },
      z.core.$strip
    >,
  ],
  "type"
>;
export type Behaviour = z.infer<typeof behaviourSchema>;
