import { z } from "zod";
import { formStepSchema, recipeFormStepSchema } from "./form-step.type";
import { processorSchema } from "./processor.type";
import { KEBAB_ID_PATTERN, KEBAB_ID_ERROR } from "./id-pattern";

// Form ID and Title identify a form before deploy, so neither may be empty and
// the Form ID must be a well-formed kebab-case identifier (same rule as
// field/step ids). Shared by both the recipe and deployed-contract schemas.
const formIdSchema = z
  .string()
  .min(1, "Form ID is required")
  .regex(KEBAB_ID_PATTERN, KEBAB_ID_ERROR);
const titleSchema = z.string().min(1, "Title is required");

// ISO 8601 datetime — accepts optional milliseconds and timezone offset/Z
// e.g. "2026-01-01T00:00:00", "2026-01-01T00:00:00.000Z", "2026-01-01T00:00:00+05:30"
export const dateTimeFormatSchema = z.string().datetime({ offset: true });
export type DateTimeFormat = z.infer<typeof dateTimeFormatSchema>;

export const contactDetailsSchema = z.object({
  title: z.string().min(1),
  telephoneNumber: z.string().min(1),
  email: z.string().email(),
  address: z
    .object({
      line1: z.string().min(1),
      line2: z.string().optional(),
      city: z.string().min(1),
      country: z.string().optional(),
    })
    .optional(),
});
export type ContactDetails = z.infer<typeof contactDetailsSchema>;

export const serviceContractSchema = z.object({
  formId: formIdSchema,
  title: titleSchema,
  description: z.string().optional(),
  contactDetails: contactDetailsSchema.optional(),
  steps: z.array(formStepSchema),
  processors: z.array(processorSchema).optional(),
  createdAt: dateTimeFormatSchema,
  updatedAt: dateTimeFormatSchema,
  version: z.string(),
});
export type ServiceContract = z.infer<typeof serviceContractSchema>;

export const serviceContractRecipeSchema = z.object({
  formId: formIdSchema,
  title: titleSchema,
  description: z.string().optional(),
  contactDetails: contactDetailsSchema.optional(),
  steps: z.array(recipeFormStepSchema),
  processors: z.array(processorSchema).optional(),
  createdAt: dateTimeFormatSchema,
  updatedAt: dateTimeFormatSchema,
  version: z.string(),
});
export type ServiceContractRecipe = z.infer<typeof serviceContractRecipeSchema>;
