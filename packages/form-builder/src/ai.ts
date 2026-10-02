import { z } from "zod";
import {
  behaviourSchema,
  fieldOverridesSchema,
  contactDetailsSchema,
  processorSchema,
  serviceIdSchema,
  servicePagePathSchema,
} from "@govtech-bb/form-types";

const object = z.record(z.string(), z.unknown());
const shortText = z.string().max(4000);

export const aiTargetSchema = z
  .object({
    serviceId: serviceIdSchema,
    pagePath: servicePagePathSchema.optional(),
  })
  .strict();
const serviceTargetSchema = aiTargetSchema.omit({ pagePath: true });

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
    kind: z.enum(["form", "content", "workspace"]),
    documentId: z.string().min(1).max(500),
    revision: z.string().min(1).max(100),
    mode: z.enum(["ask", "edit"]),
    selection: z.string().max(4000).optional(),
    document: object,
    services: z
      .array(
        z.object({
          serviceId: serviceIdSchema,
          title: z.string().max(250),
          category: z.string().max(100),
          formId: z.string().max(100).nullable(),
          revision: z.number().int().nonnegative(),
          pages: z
            .array(
              z.object({
                path: servicePagePathSchema,
                title: z.string().max(250),
                kind: z.enum(["main", "guidance", "start"]),
              }),
            )
            .max(100),
        }),
      )
      .max(50)
      .default([]),
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
    "Propose a complete form draft. Omit target for the open form, or provide a serviceId after reading its form. Omit processors to keep them unchanged. Payment settings, metadata, routing and secrets are preserved. Never invent or alter credentials. Only drafts are changed; nothing is published.",
  inputSchema: z.object({
    summary: shortText,
    recipe: aiRecipeSchema,
    target: serviceTargetSchema.optional(),
  }),
  outputSchema: outcome,
  needsApproval: true as const,
};
export const proposeContentTool = {
  name: "apply_content_patch" as const,
  description:
    "Propose changed page fields. Omit target for the open page, or provide serviceId and pagePath after reading a service page. Omit unchanged fields. Set operation to create, with a new slug, to propose a separate page. Only drafts are changed; nothing is published.",
  inputSchema: z.object({
    operation: z.enum(["update", "create"]).default("update"),
    summary: shortText,
    patch: aiContentPatchSchema,
    target: aiTargetSchema.optional(),
  }),
  outputSchema: outcome,
  needsApproval: true as const,
};

export const updateServiceDetailsTool = {
  name: "update_service_details" as const,
  description:
    "Update a service draft's details after reading the service. Omit unchanged fields. This cannot publish, delete, attach, detach, or restore anything.",
  inputSchema: z.object({
    summary: shortText,
    target: serviceTargetSchema,
    patch: z
      .object({
        title: z.string().trim().min(1).max(250).optional(),
        description: z.string().max(5000).optional(),
        category: z.string().max(100).optional(),
        subcategory: z.string().max(100).optional(),
        setup: z
          .object({
            step: z
              .enum(["about", "pages", "contacts", "delivery", "check"])
              .optional(),
            delivery: z.enum(["undecided", "configured", "none"]).optional(),
            applicantEmail: z
              .enum(["undecided", "configured", "none"])
              .optional(),
          })
          .strict()
          .optional(),
      })
      .strict(),
  }),
  outputSchema: outcome,
  needsApproval: true as const,
};
export const readServiceTool = {
  name: "read_service" as const,
  description:
    "Read the current service draft details and page index from this browser workspace. Read pages or the form separately before editing them.",
  inputSchema: serviceTargetSchema,
  outputSchema: object,
};
export const readPageTool = {
  name: "read_page" as const,
  description:
    "Read one current page draft belonging to a service in this browser workspace before proposing page edits.",
  inputSchema: aiTargetSchema.required(),
  outputSchema: object,
};
export const readFormTool = {
  name: "read_form" as const,
  description:
    "Read the existing application form draft belonging to a service in this browser workspace before proposing form edits. Credentials are redacted.",
  inputSchema: serviceTargetSchema,
  outputSchema: object,
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
