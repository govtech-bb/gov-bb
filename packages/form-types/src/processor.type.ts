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

const opencrvsConfigAuthorSchema = z.record(
  z.string(),
  z.union([z.string(), z.number()]),
);

const spreadsheetConfigAuthorSchema = z.record(
  z.string(),
  z.union([z.string(), z.number()]),
);

const paymentConfigAuthorSchema = z.object({
  provider: z.literal("ezpay"),
  department: z.string().min(1),
  paymentCode: dynamic(z.string().min(1)),
  amount: dynamic(z.number().nonnegative()),
  description: dynamic(z.string().min(1)),
  customerEmailPath: z.string().min(1),
  customerNamePath: z.string().min(1),
  allowCredit: z.boolean().optional(),
  allowDebit: z.boolean().optional(),
  allowPayce: z.boolean().optional(),
});

const webhookConfigAuthorSchema = z.object({
  url: dynamic(z.string().url()),
  method: z.enum(["POST", "PUT", "PATCH"]).default("POST"),
  headers: z.record(z.string(), dynamic(z.string())).optional(),
  secret: z.string().min(16).optional(),
  signatureHeader: z.string().min(1).default("X-Webhook-Signature"),
  timeoutMs: z.number().int().positive().max(30_000).default(10_000),
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
  allowCredit: z.boolean().optional(),
  allowDebit: z.boolean().optional(),
  allowPayce: z.boolean().optional(),
});

const webhookConfigResolvedSchema = z.object({
  url: z.string().url(),
  method: z.enum(["POST", "PUT", "PATCH"]).default("POST"),
  headers: z.record(z.string(), z.string()).optional(),
  secret: z.string().min(16).optional(),
  signatureHeader: z.string().min(1).default("X-Webhook-Signature"),
  timeoutMs: z.number().int().positive().max(30_000).default(10_000),
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
export type ResolvedWebhookProcessorConfig = z.infer<
  typeof webhookConfigResolvedSchema
>;
