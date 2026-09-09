import { z } from "zod";
import {
  behaviourSchema,
  fieldOverridesSchema,
  contactDetailsSchema,
  processorSchema,
} from "@govtech-bb/form-types";

const object = z.record(z.string(), z.unknown());
const shortText = z.string().max(4000);

// Shape checks protect the editor; semantic validation remains a review warning.
export const aiRecipeSchema = z.object({
  formId: z.string().max(200),
  title: shortText,
  description: shortText.optional(),
  contactDetails: contactDetailsSchema.optional(),
  processors: z.array(processorSchema).max(30).optional(),
  steps: z
    .array(
      z.object({
        stepId: z.string().max(200),
        title: shortText,
        description: shortText.optional(),
        elements: z
          .array(
            z.object({
              ref: z.string().max(200),
              overrides: z
                .union([
                  fieldOverridesSchema,
                  z.record(z.string(), fieldOverridesSchema),
                ])
                .optional(),
            }),
          )
          .max(200),
        behaviours: z.array(behaviourSchema).max(100).default([]),
        markdownContent: z.string().max(50000).optional(),
      }),
    )
    .max(100),
});

export const aiContentPatchSchema = z
  .object({
    title: shortText.optional(),
    description: shortText.optional(),
    body: z.string().max(100000).optional(),
    category: z.string().max(200).optional(),
    subcategory: z.string().max(200).optional(),
    slug: z.string().max(300).optional(),
    linkType: z.enum(["form", "slug", "external", "none"]).optional(),
    linkHref: z.string().max(2000).optional(),
    visibility: z.enum(["draft", "preview", "public"]).optional(),
  })
  .strict();

export const aiContextSchema = z
  .object({
    kind: z.enum(["form", "content"]),
    documentId: z.string().min(1).max(500),
    revision: z.string().min(1).max(100),
    mode: z.enum(["ask", "edit"]),
    selection: z.string().max(4000).optional(),
    document: object,
    attachments: z
      .array(
        z.object({
          reference: z.string().max(3000),
          name: z.string().max(250),
        }),
      )
      .max(3)
      .default([]),
  })
  .strict();

export type AiContext = z.infer<typeof aiContextSchema>;
export type AiContentPatch = z.infer<typeof aiContentPatchSchema>;
export type AiRecipe = z.infer<typeof aiRecipeSchema>;

const outcome = z.object({ applied: z.boolean(), message: z.string() });
export const aiQuestionSchema = z.object({
  question: z.string().min(1).max(500),
  type: z.enum(["radio", "check"]),
  options: z.array(z.string().min(1).max(200)).min(2).max(6),
});
export const askQuestionsTool = {
  name: "ask_questions" as const,
  description:
    "Ask the author up to three concrete clarification questions when their answers are needed to create or improve a draft. Offer useful choices; the author can also write a custom answer or skip. Do not use this to approve edits; use the proposal tools for edits.",
  inputSchema: z.object({ questions: z.array(aiQuestionSchema).min(1).max(3) }),
  outputSchema: z.object({
    status: z.enum(["answered", "skipped"]),
    answers: z
      .array(
        z.object({
          question: z.string().max(500),
          choices: z.array(z.string().max(200)).max(6),
          custom: z.string().max(2000),
        }),
      )
      .max(3),
  }),
};
export type AiQuestion = z.infer<typeof aiQuestionSchema>;
export type AiAnswers = z.infer<typeof askQuestionsTool.outputSchema>;

export const proposeFormTool = {
  name: "apply_form_draft" as const,
  description:
    "Propose a complete form draft for the author to review. Omit processors to keep them unchanged. Payment settings, metadata, routing and secrets are preserved. Never invent or alter credentials. This does not save or deploy.",
  inputSchema: z.object({ summary: shortText, recipe: aiRecipeSchema }),
  outputSchema: outcome,
  needsApproval: true as const,
};
export const proposeContentTool = {
  name: "apply_content_patch" as const,
  description:
    "Propose changed page fields for review. Omit unchanged fields. This only updates the local draft; it does not save or deploy.",
  inputSchema: z.object({ summary: shortText, patch: aiContentPatchSchema }),
  outputSchema: outcome,
  needsApproval: true as const,
};

export const documentTypes = {
  "application/pdf": { extension: "pdf", maxBytes: 20 * 1024 * 1024 },
  "image/png": { extension: "png", maxBytes: 10 * 1024 * 1024 },
  "image/jpeg": { extension: "jpg", maxBytes: 10 * 1024 * 1024 },
} as const;
export const aiUploadSchema = z
  .object({
    name: z.string().min(1).max(250),
    type: z.enum(["application/pdf", "image/png", "image/jpeg"]),
    size: z.number().int().positive(),
  })
  .superRefine((file, ctx) => {
    const extension = file.name.split(".").pop()?.toLowerCase();
    const validExtension =
      file.type === "image/jpeg"
        ? ["jpg", "jpeg"].includes(extension ?? "")
        : extension === documentTypes[file.type].extension;
    if (!validExtension || file.size > documentTypes[file.type].maxBytes) {
      ctx.addIssue({
        code: "custom",
        message:
          "Use a PDF up to 20 MB or a PNG/JPEG up to 10 MB, with a matching file extension.",
      });
    }
  });

export function redactAiData(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactAiData);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key,
      /^(secret|token|accessToken|password|apiKey|authorization)$/i.test(key)
        ? "__REDACTED__"
        : redactAiData(item),
    ]),
  );
}
