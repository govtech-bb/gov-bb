import { z } from "zod";

// Note: DATABASE_URL is intentionally NOT in this schema. Its lifecycle is
// owned by `src/lib/db/index.ts`, which resolves it at runtime from one of:
// process.env.DATABASE_URL (CLI/ECS), CHAT_DATABASE_URL, or Secrets Manager
// (via CHAT_DATABASE_URL_SECRET_ARN — the SSR Lambda path, issue #202).
const envSchema = z.object({
  RAG_URL: z.url(),
  FORM_API_URL: z.url().transform((s) => s.replace(/\/+$/, "")),
  // Forms frontend (not the API). Used to hand users a link to forms that
  // are too complex to collect inline (file uploads, payment).
  FORMS_URL: z.url().transform((s) => s.replace(/\/+$/, "")),
  // Landing frontend. Used to hand users the general feedback form
  // (<LANDING_URL>/feedback) when their feedback is about a service or
  // alpha.gov.bb in general. Defaults to the sandbox origin, mirroring the
  // client-side fallback in components/chat/chrome.tsx; prod sets LANDING_URL.
  LANDING_URL: z
    .url()
    .default("https://landing.sandbox.alpha.gov.bb")
    .transform((s) => s.replace(/\/+$/, "")),
  BEDROCK_REGION: z.string().optional(),
  LLM_MODEL: z.string().default("claude-sonnet-4-6"),
  REWRITE_MODEL: z.string().default("claude-haiku-4-5"),
  // Opt-in: cache the static system prompt via a Bedrock cache point. Off
  // unless explicitly set, since caching support varies by model/region.
  BEDROCK_PROMPT_CACHE: z
    .string()
    .optional()
    .transform((v) => v === "1" || v === "true"),
});

// Each `process.env.X` is a literal so Vite's `define` substitution can
// bake it into the bundle at build time. Passing `process.env` directly
// would defeat the substitution and leave fields undefined on Amplify.
export const getServerEnv = () =>
  envSchema.parse({
    RAG_URL: process.env.RAG_URL,
    FORM_API_URL: process.env.FORM_API_URL,
    FORMS_URL: process.env.FORMS_URL,
    LANDING_URL: process.env.LANDING_URL,
    BEDROCK_REGION: process.env.BEDROCK_REGION,
    LLM_MODEL: process.env.LLM_MODEL,
    REWRITE_MODEL: process.env.REWRITE_MODEL,
    BEDROCK_PROMPT_CACHE: process.env.BEDROCK_PROMPT_CACHE,
  });
