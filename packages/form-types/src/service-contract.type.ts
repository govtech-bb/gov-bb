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

// Per-environment MDA contacts (issue #607) carry the public contact fields,
// but a contact may legitimately have only some of them (e.g. an email-only
// MDA, or a directory entry awaiting a phone number). So `title`,
// `telephoneNumber` and `email` are all optional — when present they must still
// be well-formed (non-empty / a valid email). `address` was already optional.
// Consumers must treat every field as possibly-absent: the citizen-facing
// confirmation hides a missing line, and the email processor's
// `contactDetails.email` recipient resolves to undefined, failing that entry
// loudly (surfaced via SQS retry/DLQ, not silently dropped).
export const contactDetailsSchema = z.object({
  title: z.string().min(1).optional(),
  telephoneNumber: z.string().min(1).optional(),
  email: z.string().email().optional(),
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
  // Safe public flag derived from `processors` server-side. Exposed on the
  // public contract (which strips `processors`) so the chat handoff check can
  // tell whether a form needs payment without leaking processor internals.
  // See issue #965.
  requiresPayment: z.boolean().optional(),
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
