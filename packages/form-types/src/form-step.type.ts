import { z } from "zod";
import { fieldOverridesSchema, primitiveSchema } from "./primitive.type";
import {
  behaviourSchema,
  conditionalMarkdownSchema,
  conditionalTitleSchema,
} from "./behavior.type";
import { kebabIdSchema } from "./id-pattern";

export const formStepSchema = z.object({
  stepId: kebabIdSchema,
  title: z.string(),
  // Optional per-answer title overrides (#871). When a step's title should
  // adapt to an earlier answer (e.g. "Provide your birth details" vs "Provide
  // the person's birth details"), list the conditions here; `title` above is
  // the fallback when none match. See `resolveStepTitle` in form-conditions.
  conditionalTitle: z.array(conditionalTitleSchema).optional(),
  description: z.string().optional(),
  elements: z.array(primitiveSchema),
  behaviours: z.array(behaviourSchema).optional(),
  // Raw markdown rendered on the submission-confirmation page (parsed by the
  // forms client). Lets a recipe drive form-specific confirmation content
  // (e.g. a "What you need to know" section) without code changes. Distinct
  // from `nextSteps`, which renders structured title/content/items blocks.
  markdownContent: z.string().optional(),
  // Per-answer passages within `markdownContent` (#2068). Each entry fills one
  // `{token}` the markdown carries inline, so several passages of one
  // confirmation body can follow different answers without duplicating the
  // body. Resolved by `resolveConditionalMarkdown` in form-conditions, which
  // both confirmation surfaces (page and applicant email) call.
  conditionalMarkdown: z.array(conditionalMarkdownSchema).optional(),
  // Suppress the "Submission ID" line on the submission-confirmation page. For
  // an anonymous form (e.g. the exit survey) that issues no meaningful
  // reference, the design shows no ID. Omitted ⇒ the ID is shown as before.
  hideReferenceNumber: z.boolean().optional(),
  nextSteps: z
    .array(
      z.object({
        title: z.string(),
        content: z.string().optional(),
        items: z.array(z.string()).optional(),
      }),
    )
    .optional(),
});
export type FormStep = z.infer<typeof formStepSchema>;

export const recipeComponentFieldSchema = z.object({
  ref: z.string().regex(/^components\//),
  overrides: fieldOverridesSchema.optional(),
});
export type RecipeComponentField = z.infer<typeof recipeComponentFieldSchema>;

export const recipeBlockFieldSchema = z.object({
  ref: z.string().regex(/^blocks\//),
  // Keys are the block's child fieldIds, so the kebab rule applies to them
  // the same as to any other fieldId position.
  overrides: z.record(kebabIdSchema, fieldOverridesSchema).optional(),
});
export type RecipeBlockField = z.infer<typeof recipeBlockFieldSchema>;

export const recipeFormStepFieldSchema = z.union([
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
