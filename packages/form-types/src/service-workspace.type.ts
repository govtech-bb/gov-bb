import { z } from "zod";
import { kebabIdSchema } from "./id-pattern";
import {
  contactDetailsSchema,
  draftRecipeSchema,
  type DraftRecipe,
} from "./service-contract.type";
import { processorSchema, type Processor } from "./processor.type";
import { classifyRecipientField } from "./recipient-field";

export const serviceIdSchema = kebabIdSchema.max(100);
export const servicePagePathSchema = z
  .string()
  .max(500)
  .regex(
    /^apps\/landing\/src\/content\/(?:[a-z0-9]+(?:-[a-z0-9]+)*\/)*[a-z0-9]+(?:-[a-z0-9]+)*\.md$/,
    "Choose a Markdown page inside the service content directory",
  );
const pageSchema = z.object({
  id: z.string().uuid(),
  path: servicePagePathSchema,
  title: z.string().max(250),
  publicPath: z
    .string()
    .max(600)
    .regex(/^\/(?!\/)[^?#\s]*$/),
  kind: z.enum(["main", "guidance", "start"]),
});

export const serviceManifestSchema = z
  .object({
    schemaVersion: z.literal(1),
    serviceId: serviceIdSchema,
    // No `visibility` (#2875, #2683): a form's status is the `service_status`
    // row set in Feature flagging and a page's is its own frontmatter. A saved
    // manifest that still carries the retired field parses; the key is dropped.
    title: z.string().trim().min(1).max(250),
    description: z.string().max(5000).default(""),
    category: z.string().max(100).default(""),
    subcategory: z.string().max(100).default(""),
    formId: kebabIdSchema.max(100).nullable(),
    entryPoint: z.string().nullable(),
    pages: z.array(pageSchema).max(100),
    contactDetails: contactDetailsSchema.optional(),
    setup: z
      .object({
        step: z
          .enum(["about", "pages", "contacts", "delivery", "check"])
          .default("about"),
        delivery: z
          .enum(["undecided", "configured", "none"])
          .default("undecided"),
        applicantEmail: z
          .enum(["undecided", "configured", "none"])
          .default("undecided"),
      })
      .default({
        step: "about",
        delivery: "undecided",
        applicantEmail: "undecided",
      }),
  })
  .superRefine((value, ctx) => {
    for (const key of ["id", "path", "publicPath"] as const) {
      if (new Set(value.pages.map((p) => p[key])).size !== value.pages.length)
        ctx.addIssue({
          code: "custom",
          path: ["pages"],
          message: `Pages must have unique ${key}s`,
        });
    }
    if (value.pages.filter((p) => p.kind === "main").length > 1)
      ctx.addIssue({
        code: "custom",
        path: ["pages"],
        message: "A service has one main page",
      });
    if (
      value.entryPoint !== null &&
      value.entryPoint !== "form" &&
      !value.pages.some((p) => p.id === value.entryPoint)
    )
      ctx.addIssue({
        code: "custom",
        path: ["entryPoint"],
        message: "Choose a page belonging to this service",
      });
    if (value.entryPoint === "form" && !value.formId)
      ctx.addIssue({
        code: "custom",
        path: ["entryPoint"],
        message: "Connect a form before using it as the entry point",
      });
  });

export const servicePageDraftSchema = z.object({
  id: z.string().uuid(),
  path: servicePagePathSchema,
  frontmatter: z.record(z.string(), z.unknown()),
  body: z.string().max(500_000),
  baseSha: z
    .string()
    .regex(/^[0-9a-f]{40}$/)
    .nullable(),
});
export const servicePendingConfigSchema = z.object({
  mdaContactId: z.string().uuid().nullable(),
  processors: z
    .array(processorSchema)
    .refine(
      (ps): boolean => ps.every((p) => p.type === "payment"),
      "Only payment configuration belongs in the private sidecar",
    )
    .nullable(),
});
export const serviceSnapshotSchema = z
  .object({
    manifest: serviceManifestSchema,
    pages: z.array(servicePageDraftSchema).max(100),
    recipe: draftRecipeSchema.nullable(),
    pendingConfig: servicePendingConfigSchema,
    baseRecipeSha: z
      .string()
      .regex(/^[0-9a-f]{40}$/)
      .nullable()
      .default(null),
    baseManifestSha: z
      .string()
      .regex(/^[0-9a-f]{40}$/)
      .nullable()
      .default(null),
  })
  .superRefine((value, ctx) => {
    // A recipe must belong to the manifest's form. The recipe itself may be
    // absent while the form cannot be fetched; serviceReadiness reports that.
    if (value.recipe && value.recipe.formId !== value.manifest.formId)
      ctx.addIssue({
        code: "custom",
        path: ["recipe"],
        message: "The form must belong to this service",
      });
    if (
      value.pages.length !== value.manifest.pages.length ||
      value.manifest.pages.some(
        (p) => !value.pages.some((d) => d.id === p.id && d.path === p.path),
      )
    )
      ctx.addIssue({
        code: "custom",
        path: ["pages"],
        message: "Load all of the service pages before saving",
      });
  });
export const serviceDraftSchema = serviceSnapshotSchema.safeExtend({
  revision: z.number().int().nonnegative(),
  updatedAt: z.string(),
  updatedBy: z.string(),
});
export type ServiceManifest = z.infer<typeof serviceManifestSchema>;
export type ServicePageDraft = z.infer<typeof servicePageDraftSchema>;
export type ServiceSnapshot = z.infer<typeof serviceSnapshotSchema>;
export type ServiceDraft = z.infer<typeof serviceDraftSchema>;
export type ServicePendingConfig = z.infer<typeof servicePendingConfigSchema>;
export interface ServiceCheckpoint {
  id: string;
  serviceId: string;
  revision: number;
  label: string;
  createdAt: string;
  createdBy: string;
  gitSha: string | null;
  gitRef: string | null;
  prNumber: number | null;
  prUrl: string | null;
}
export interface ServiceReadiness {
  ready: boolean;
  issues: {
    id: string;
    section: "about" | "pages" | "contacts" | "delivery";
    message: string;
  }[];
}

/** An email action addressed to the applicant: its recipient is a submitted answer. */
export function isApplicantEmailAction(
  processor: Processor,
): processor is Extract<Processor, { type: "email" }> {
  return (
    processor.type === "email" &&
    typeof processor.config.recipientField === "string" &&
    !!processor.config.recipientField.trim() &&
    classifyRecipientField(processor.config.recipientField) === "submitted"
  );
}

/**
 * The After submission decisions a recipe already states — the rule the
 * Details page applies on Save, shared so a seed never disagrees with it
 * (#2683). The applicant confirmation email is not a delivery action.
 */
export function deriveServiceSetup(
  recipe: Pick<DraftRecipe, "processors">,
  pendingConfig: Pick<ServicePendingConfig, "processors">,
): Pick<ServiceManifest["setup"], "delivery" | "applicantEmail"> {
  const processors = recipe.processors ?? [];
  return {
    applicantEmail: processors.some(isApplicantEmailAction)
      ? "configured"
      : "none",
    delivery:
      processors.some((p) => !isApplicantEmailAction(p)) ||
      pendingConfig.processors?.length
        ? "configured"
        : "none",
  };
}

/**
 * Seeds the manifest with what the recipe already decides, leaving an
 * author's own choice alone (ADR 0073): a field is replaced while it still
 * reads as the system default, `undecided`. The earlier seed decided
 * `delivery` alone — `configured` for any action, including the applicant
 * email, which readiness rejects as "Add a delivery action" — and never
 * `applicantEmail`, while a Details save or this seed decides both; so an
 * undecided `applicantEmail` marks a `delivery` that is that seed's output
 * rather than an author's, and the pair is replaced together. The public
 * contact is filled only when the manifest has none. No-op while the form
 * cannot be fetched.
 */
export function seedServiceManifest(
  manifest: ServiceManifest,
  recipe: Pick<DraftRecipe, "processors" | "contactDetails"> | null,
  pendingConfig: Pick<ServicePendingConfig, "processors">,
): ServiceManifest {
  if (!recipe) return manifest;
  const derived = deriveServiceSetup(recipe, pendingConfig);
  const { setup } = manifest;
  const contactDetails = manifest.contactDetails ?? recipe.contactDetails;
  const undecided = setup.applicantEmail === "undecided";
  return {
    ...manifest,
    ...(contactDetails ? { contactDetails } : {}),
    setup: {
      ...setup,
      applicantEmail: undecided ? derived.applicantEmail : setup.applicantEmail,
      delivery:
        undecided || setup.delivery === "undecided"
          ? derived.delivery
          : setup.delivery,
    },
  };
}

/** Reads existing authoring semantics; it does not invent a second form router. */
export function serviceReadiness(snapshot: ServiceSnapshot): ServiceReadiness {
  const { manifest, recipe, pages, pendingConfig } = snapshot;
  const issues: ServiceReadiness["issues"] = [];
  const issue = (
    id: string,
    section: ServiceReadiness["issues"][number]["section"],
    message: string,
  ) => issues.push({ id, section, message });
  if (!manifest.category)
    issue("category", "about", "Choose a service category");
  if (!manifest.entryPoint)
    issue("entry", "pages", "Choose where people start this service");
  const contact = manifest.contactDetails ?? recipe?.contactDetails;
  if (contact?.email && !z.email().safeParse(contact.email).success)
    issue("contact-email", "contacts", "Enter a valid public email address");
  for (const page of pages) {
    if (!page.body.trim() || !String(page.frontmatter.title ?? "").trim())
      issue(
        page.id,
        "pages",
        `Finish ${manifest.pages.find((p) => p.id === page.id)?.title || "the content page"}`,
      );
    if (
      page.frontmatter.form_id &&
      page.frontmatter.form_id !== manifest.formId
    )
      issue(
        `${page.id}-form`,
        "pages",
        "A page links to a different service's form",
      );
  }
  if (manifest.formId && !recipe)
    issue("missing-form", "pages", "The connected form could not be loaded");
  for (const page of pages) {
    const redirect = page.frontmatter.redirect_to;
    if (
      redirect &&
      (typeof redirect !== "string" ||
        !manifest.pages.some(
          (p) =>
            p.publicPath === redirect &&
            p.id !== page.id &&
            !pages.find((d) => d.id === p.id)?.frontmatter.redirect_to,
        ))
    )
      issue(
        `${page.id}-redirect`,
        "pages",
        "Choose another service page for the redirect",
      );
  }
  if (recipe) {
    if (
      !recipe.steps.some(
        (s) =>
          ![
            "check-your-answers",
            "declaration",
            "submission-confirmation",
          ].includes(s.stepId) && s.elements.length,
      )
    )
      issue("questions", "pages", "Add the application questions");
    if (!recipe.steps.some((s) => s.stepId === "submission-confirmation"))
      issue("confirmation", "delivery", "Add the confirmation page");
    if (manifest.setup.delivery === "undecided")
      issue("delivery", "delivery", "Choose what happens after submission");
    if (manifest.setup.applicantEmail === "undecided")
      issue(
        "applicant-email",
        "delivery",
        "Choose whether the applicant receives a confirmation email",
      );
    const applicantEmails = (recipe.processors ?? []).filter(
      isApplicantEmailAction,
    );
    const deliveryActions = (recipe.processors ?? []).filter(
      (p) => !isApplicantEmailAction(p),
    );
    if (
      manifest.setup.applicantEmail === "configured" &&
      !applicantEmails.length
    )
      issue(
        "applicant-question",
        "delivery",
        "Choose the question containing the applicant’s email address",
      );
    if (manifest.setup.applicantEmail === "none" && applicantEmails.length)
      issue(
        "applicant-choice",
        "delivery",
        "Remove applicant email actions or choose to send a confirmation email",
      );
    if (
      manifest.setup.delivery === "none" &&
      (deliveryActions.length || pendingConfig.processors?.length)
    )
      issue(
        "delivery-choice",
        "delivery",
        "Remove delivery actions or choose to use them",
      );
    if (
      manifest.setup.delivery === "configured" &&
      !deliveryActions.length &&
      !pendingConfig.processors?.length
    )
      issue("delivery-action", "delivery", "Add a delivery action");
    if (
      !contact?.email &&
      (recipe.processors ?? []).some(
        (p) =>
          p.type === "email" &&
          typeof p.config.recipientField === "string" &&
          classifyRecipientField(p.config.recipientField) === "contact",
      )
    )
      issue(
        "contact-recipient",
        "delivery",
        "Add a public email address or change the department email recipient",
      );
    const ids = new Set(recipe.steps.map((s) => s.stepId));
    for (const step of recipe.steps)
      for (const behaviour of step.behaviours ?? []) {
        if (
          "targetStepId" in behaviour &&
          typeof behaviour.targetStepId === "string" &&
          (!ids.has(behaviour.targetStepId) ||
            recipe.steps.findIndex(
              (s) => s.stepId === behaviour.targetStepId,
            ) >= recipe.steps.indexOf(step))
        )
          issue(
            `condition-${step.stepId}`,
            "pages",
            `${step.title ?? step.stepId} has a condition that must refer to an earlier page`,
          );
      }
  }
  return { ready: issues.length === 0, issues };
}
