import { z } from "zod";
import { fieldOverridesSchema, primitiveSchema } from "./primitive.type";
import { behaviourSchema } from "./behavior.type";

const paymentSummarySchema = z.object({
  label: z.string(),
  amount: z.number(),
  quantity: z.number().optional(),
  total: z.object({ amount: z.number() }),
  currency: z.string(),
});

export type PaymentSummary = z.infer<typeof paymentSummarySchema>;

export const formStepSchema = z.object({
  stepId: z.string(),
  title: z.string(),
  description: z.string().optional(),
  elements: z.array(primitiveSchema),
  behaviours: z.array(behaviourSchema).optional(),
  paymentSummary: paymentSummarySchema.optional(),
});
export type FormStep = z.infer<typeof formStepSchema>;

export const recipeComponentFieldSchema = z.object({
  ref: z.string().regex(/^components\//),
  overrides: fieldOverridesSchema.optional(),
});
export type RecipeComponentField = z.infer<typeof recipeComponentFieldSchema>;

export const recipeBlockFieldSchema = z.object({
  ref: z.string().regex(/^blocks\//),
  overrides: z.record(z.string(), fieldOverridesSchema).optional(),
});
export type RecipeBlockField = z.infer<typeof recipeBlockFieldSchema>;

export const recipeFormStepFieldSchema = z.discriminatedUnion("ref", [
  recipeComponentFieldSchema,
  recipeBlockFieldSchema,
]);
export type RecipeFormStepField = z.infer<typeof recipeFormStepFieldSchema>;

export const recipeFormStepSchema = formStepSchema
  .omit({ elements: true })
  .extend({
    elements: z.array(recipeFormStepFieldSchema),
  });
export type RecipeFormStep = z.infer<typeof recipeFormStepSchema>;
