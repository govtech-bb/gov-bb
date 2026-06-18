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

const webhookConfigAuthorSchema = z.object({
  url: dynamic(z.string().url()),
  method: z.enum(["POST", "PUT", "PATCH"]).default("POST"),
  headers: z.record(z.string(), dynamic(z.string())).optional(),
  secret: z.string().min(16).optional(),
  signatureHeader: z.string().min(1).default("X-Webhook-Signature"),
  timeoutMs: z.number().int().positive().max(30_000).default(10_000),
});

// Dispatches an accepted submission to the external case-management system. The
// endpoint URL and API key live in api env (WEBHOOK_URL / WEBHOOK_SECRET), so a
// recipe only declares which programme the submission belongs to. `programmeCode`
// is a service code (e.g. "BYAC", "CAMP"); the api validates it against its
// service catalogue at dispatch time.
const caseManagementConfigAuthorSchema = z.object({
  programmeCode: z.string().min(1),
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
const caseManagementProcessorSchema = z.object({
  type: z.literal("case-management"),
  config: caseManagementConfigAuthorSchema,
});

export const processorSchema = z.discriminatedUnion("type", [
  emailProcessorSchema,
  opencrvsProcessorSchema,
  spreadsheetProcessorSchema,
  paymentProcessorSchema,
  webhookProcessorSchema,
  caseManagementProcessorSchema,
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
  // case-management config has no dynamic() fields, so author == resolved.
  z.object({
    type: z.literal("case-management"),
    config: caseManagementConfigAuthorSchema,
  }),
]);

export type ResolvedProcessor = z.infer<typeof resolvedProcessorSchema>;
export type ResolvedPaymentProcessorConfig = z.infer<
  typeof paymentConfigResolvedSchema
>;
export type WebhookProcessorConfig = z.infer<typeof webhookConfigAuthorSchema>;
export type CaseManagementProcessorConfig = z.infer<
  typeof caseManagementConfigAuthorSchema
>;
export type ResolvedWebhookProcessorConfig = z.infer<
  typeof webhookConfigResolvedSchema
>;
