import { z } from "zod";
import {
  formStepSchema,
  RecipeFormStep,
  recipeFormStepSchema,
} from "./form-step.type";
import { Processor, processorSchema } from "./processor.type";

// ISO 8601 datetime — accepts optional milliseconds and timezone offset/Z
// e.g. "2026-01-01T00:00:00", "2026-01-01T00:00:00.000Z", "2026-01-01T00:00:00+05:30"
export const dateTimeFormatSchema = z.string().datetime({ offset: true });
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
