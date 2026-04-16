import { z } from "zod";
import { formStepSchema, RecipeFormStep, recipeFormStepSchema } from "./form-step.type";
import { Processor, processorSchema } from "./processor.type";

// YYYY-MM-DDTHH:MM:SS
export const dateTimeFormatSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/);
export type DateTimeFormat = z.infer<typeof dateTimeFormatSchema>;


export const serviceContractSchema = z.object({
  formId: z.string(),
  title: z.string(),
  description: z.string().optional(),
  steps: z.array(formStepSchema),
  processors: z.array(processorSchema).optional(),
  createdAt: dateTimeFormatSchema,
  updatedAt: dateTimeFormatSchema,
  version: z.string(),
});
export type ServiceContract = z.infer<typeof serviceContractSchema>;

export const serviceContractRecipeSchema = z.object({
  formId: z.string(),
  title: z.string(),
  description: z.string().optional(),
  steps: z.array(recipeFormStepSchema),
  processors: z.array(processorSchema).optional(),
  createdAt: dateTimeFormatSchema,
  updatedAt: dateTimeFormatSchema,
  version: z.string(),
});
export type ServiceContractRecipe = z.infer<typeof serviceContractRecipeSchema>;

