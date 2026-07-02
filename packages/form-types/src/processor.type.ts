import z from "zod";
import { dynamic } from "./dynamic";

// ---------- Author-time schemas (dynamic() allowed where templatable) ----------

const emailConfigAuthorSchema = z.object({
  recipientField: dynamic(z.string().min(1)),
  subject: dynamic(z.string().min(1)).optional(),
  // Per-instance display label (e.g. "Applicant Email" / "MDA Email"). Plain
  // literal — labels aren't templated. Metadata only; ignored for delivery.
  label: z.string().min(1).optional(),
});

const opencrvsConfigAuthorSchema = z
  .object({
    endpoint: z
      .url()
      .refine((u) => u.startsWith("https://"), "endpoint must use https")
      .optional(),
    token: z.string().min(1).optional(),
  })
  .strict();

const spreadsheetConfigAuthorSchema = z
  .object({
    filename: z.string().min(1).optional(),
  })
  .strict();

export const paymentConfigAuthorSchema = z.object({
  provider: z.literal("ezpay"),
  department: z.string().min(1),
  paymentCode: dynamic(z.string().min(1)),
  amount: dynamic(z.number().nonnegative()),
  description: dynamic(z.string().min(1)),
  customerEmailPath: z.string().min(1),
  customerNamePath: z.string().min(1),
});

// ---------- Webhook: endpoint / auth / mapping building blocks ----------
// These describe routing, not values, so they are plain literals (no dynamic()):
// author == resolved.

// Resolve the endpoint from an env var (base URL) plus an optional path, instead
// of hard-coding a URL in the recipe. Keeps deploy-specific URLs out of git.
const webhookEndpointSchema = z.object({
  env: z.string().min(1),
  path: z.string().optional(),
});

const webhookAuthSchema = z.discriminatedUnion("scheme", [
  z.object({
    scheme: z.literal("hmac"),
    secret: z.string().min(16),
    signatureHeader: z.string().min(1).default("X-Webhook-Signature"),
  }),
  // Reads the key from an env var (not the recipe) — secrets stay out of git.
  z.object({
    scheme: z.literal("apiKey"),
    header: z.string().min(1),
    secretEnv: z.string().min(1),
  }),
  z.object({ scheme: z.literal("none") }),
]);

// Generic submission → external payload mapping. Field paths are "stepId.fieldId"
// into the submission values, so any form can be mapped from its recipe without
// hard-coding step/field conventions in the API. `name` may be a single path or
// an ordered list joined with spaces (e.g. first + last name).
const webhookMappingSchema = z.object({
  programmeCode: z.string().min(1),
  applicant: z.object({
    name: z.union([z.string().min(1), z.array(z.string().min(1)).min(1)]),
    email: z.string().min(1),
    phone: z.string().min(1),
  }),
  // Steps dropped from form_data (process steps that aren't application content).
  excludeSteps: z.array(z.string()).default([]),
  // When true, form_data keeps fields nested under their step id instead of
  // hoisting them all to the top level.
  groupByStep: z.boolean().default(false),
});

const webhookConfigAuthorSchema = z
  .object({
    // Either a literal url, or an env-sourced endpoint — exactly one is required.
    url: dynamic(z.string().url()).optional(),
    endpoint: webhookEndpointSchema.optional(),
    method: z.enum(["POST", "PUT", "PATCH"]).default("POST"),
    headers: z.record(z.string(), dynamic(z.string())).optional(),
    // Legacy inline HMAC secret (use `auth` for new configs).
    secret: z.string().min(16).optional(),
    signatureHeader: z.string().min(1).default("X-Webhook-Signature"),
    auth: webhookAuthSchema.optional(),
    // When present, the processor builds this mapped payload instead of the
    // default generic envelope.
    mapping: webhookMappingSchema.optional(),
    timeoutMs: z.number().int().positive().max(30_000).default(10_000),
  })
  .refine((c) => Boolean(c.url) || Boolean(c.endpoint), {
    message: "webhook config requires either `url` or `endpoint`",
  });

const emailProcessorSchema = z.object({
  type: z.literal("email"),
  config: emailConfigAuthorSchema,
});
const opencrvsProcessorSchema = z.object({
  type: z.literal("opencrvs"),
  config: opencrvsConfigAuthorSchema,
});
const spreadsheetProcessorSchema = z.object({
  type: z.literal("spreadsheet"),
  config: spreadsheetConfigAuthorSchema,
});
const paymentProcessorSchema = z.object({
  type: z.literal("payment"),
  config: paymentConfigAuthorSchema,
});
const webhookProcessorSchema = z.object({
  type: z.literal("webhook"),
  config: webhookConfigAuthorSchema,
});

export const processorSchema = z.discriminatedUnion("type", [
  emailProcessorSchema,
  opencrvsProcessorSchema,
  spreadsheetProcessorSchema,
  paymentProcessorSchema,
  webhookProcessorSchema,
]);

export type Processor = z.infer<typeof processorSchema>;
export type PaymentProcessorConfig = z.infer<typeof paymentConfigAuthorSchema>;

// ---------- Resolved-time schemas (literals only) ----------

const emailConfigResolvedSchema = z.object({
  recipientField: z.string().min(1),
  subject: z.string().min(1).optional(),
  // See emailConfigAuthorSchema — carried verbatim through resolution.
  label: z.string().min(1).optional(),
});

const paymentConfigResolvedSchema = z.object({
  provider: z.literal("ezpay"),
  department: z.string().min(1),
  paymentCode: z.string().min(1),
  amount: z.number().nonnegative(),
  description: z.string().min(1),
  customerEmailPath: z.string().min(1),
  customerNamePath: z.string().min(1),
});

const webhookConfigResolvedSchema = z
  .object({
    url: z.string().url().optional(),
    endpoint: webhookEndpointSchema.optional(),
    method: z.enum(["POST", "PUT", "PATCH"]).default("POST"),
    headers: z.record(z.string(), z.string()).optional(),
    secret: z.string().min(16).optional(),
    signatureHeader: z.string().min(1).default("X-Webhook-Signature"),
    auth: webhookAuthSchema.optional(),
    mapping: webhookMappingSchema.optional(),
    timeoutMs: z.number().int().positive().max(30_000).default(10_000),
  })
  .refine((c) => Boolean(c.url) || Boolean(c.endpoint), {
    message: "webhook config requires either `url` or `endpoint`",
  });

export const resolvedProcessorSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("email"), config: emailConfigResolvedSchema }),
  z.object({ type: z.literal("opencrvs"), config: opencrvsConfigAuthorSchema }),
  z.object({
    type: z.literal("spreadsheet"),
    config: spreadsheetConfigAuthorSchema,
  }),
  z.object({ type: z.literal("payment"), config: paymentConfigResolvedSchema }),
  z.object({
    type: z.literal("webhook"),
    config: webhookConfigResolvedSchema,
  }),
]);

export type ResolvedProcessor = z.infer<typeof resolvedProcessorSchema>;
export type ResolvedPaymentProcessorConfig = z.infer<
  typeof paymentConfigResolvedSchema
>;
export type WebhookProcessorConfig = z.infer<typeof webhookConfigAuthorSchema>;
export type WebhookMapping = z.infer<typeof webhookMappingSchema>;
export type ResolvedWebhookProcessorConfig = z.infer<
  typeof webhookConfigResolvedSchema
>;
