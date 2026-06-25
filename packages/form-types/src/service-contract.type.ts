import { z } from "zod";
import { formStepSchema, recipeFormStepSchema } from "./form-step.type";
import { processorSchema } from "./processor.type";
import { KEBAB_ID_PATTERN, KEBAB_ID_ERROR } from "./id-pattern";
import { semverSchema } from "./version-pattern";

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
  // Version is retired (#1196): canonical recipes carry no version. Kept
  // optional so legacy versioned files still parse during the two-phase retire.
  version: semverSchema.optional(),
});
export type ServiceContract = z.infer<typeof serviceContractSchema>;

// Service launch gate (#1646). `visibility` decides whether the public can
// reach a form: `public` is served normally; `preview`/`draft` are hidden
// (404) from the public and only resolve when a valid recipe-preview token is
// supplied. Mirrors apps/landing's page-level visibility levels.
export const recipeVisibilitySchema = z.enum(["public", "preview", "draft"]);
export type RecipeVisibility = z.infer<typeof recipeVisibilitySchema>;

// `meta` is an extensible container for recipe-level metadata. Optional during
// the #1646 rollout so existing recipes (which carry no `meta`) still validate;
// an absent `meta` or `visibility` is treated as `public` (see
// getRecipeVisibility).
export const recipeMetaSchema = z.object({
  visibility: recipeVisibilitySchema.default("public"),
});
export type RecipeMeta = z.infer<typeof recipeMetaSchema>;

export const serviceContractRecipeSchema = z.object({
  formId: formIdSchema,
  title: titleSchema,
  description: z.string().optional(),
  contactDetails: contactDetailsSchema.optional(),
  steps: z.array(recipeFormStepSchema),
  processors: z.array(processorSchema).optional(),
  createdAt: dateTimeFormatSchema,
  updatedAt: dateTimeFormatSchema,
  // See serviceContractSchema.version — optional during the #1196 two-phase retire.
  version: semverSchema.optional(),
  meta: recipeMetaSchema.optional(),
});
export type ServiceContractRecipe = z.infer<typeof serviceContractRecipeSchema>;

/**
 * Resolve a recipe's effective visibility. An absent `meta` (every recipe
 * predating #1646) or absent `visibility` defaults to `public`.
 */
export function getRecipeVisibility(
  recipe: Pick<ServiceContractRecipe, "meta">,
): RecipeVisibility {
  return recipe.meta?.visibility ?? "public";
}
