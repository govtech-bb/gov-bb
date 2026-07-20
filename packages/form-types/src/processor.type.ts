import z from "zod";
import { dynamic } from "./dynamic";

// Static SSRF guard for author-supplied outbound URLs (#281): require https and
// reject hosts that are *literal* private/internal IPs — notably the cloud
// metadata address 169.254.169.254 and the private/loopback ranges. This is the
// static layer; a hostname that *resolves* to an internal IP is the runtime
// fetch-time guard's job. Pure JS only (no node:net) — this module is bundled
// for the browser too.
const SAFE_URL_ERROR = "must be an https URL to a public host";

function isSafeExternalHttpsUrl(value: string): boolean {
  // Pure string parse (no URL/global) so this stays browser- and node-safe.
  // The schema's `.url()` has already confirmed it's a syntactically valid URL.
  const match = /^https:\/\/([^/?#]+)/i.exec(value);
  if (!match) return false; // not https (or unparseable authority)

  // `.url()` ran first, so the authority is well-formed. Strip any userinfo,
  // then the host is either an "[ipv6]" literal or "host:port".
  const authority = match[1].slice(match[1].lastIndexOf("@") + 1);
  const host = (
    authority.startsWith("[")
      ? authority.slice(1, authority.indexOf("]"))
      : authority.split(":")[0]
  ).toLowerCase();
  if (host === "localhost") return false;

  // IPv6 literals contain ":"; real domains never do.
  if (host.includes(":")) {
    if (host === "::1" || host === "::") return false;
    if (/^f[cd]/.test(host)) return false; // fc00::/7 (unique local)
    if (/^fe[89ab]/.test(host)) return false; // fe80::/10 (link-local)
    return true;
  }

  // Only apply IPv4 rules to true dotted-quad literals, so a domain like
  // "10things.example.com" is not mistaken for 10.0.0.0/8.
  const v4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (v4) {
    const a = Number(v4[1]);
    const b = Number(v4[2]);
    if (a === 0 || a === 10 || a === 127) return false;
    if (a === 169 && b === 254) return false; // link-local incl. metadata
    if (a === 172 && b >= 16 && b <= 31) return false;
    if (a === 192 && b === 168) return false;
    if (a === 100 && b >= 64 && b <= 127) return false; // CGNAT
  }
  return true;
}

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
      .refine(isSafeExternalHttpsUrl, `endpoint ${SAFE_URL_ERROR}`)
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
  // When set, the payload `code` is a service-prefixed application code
  // (generateApplicationCode) instead of the submission reference code. Must be
  // a known ServiceCode — the processor runtime-guards it and fails loud on an
  // unknown value. Kept a plain string here (form-types can't import the api's
  // ServiceCode); the CI recipe-lint validates the value.
  codeService: z.string().min(1).optional(),
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
    // The literal branch must be a safe https URL (#281); a dynamic expression
    // (JsonLogic object) bypasses the static check and is resolved at runtime.
    url: dynamic(
      z.string().url().refine(isSafeExternalHttpsUrl, `url ${SAFE_URL_ERROR}`),
    ).optional(),
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
