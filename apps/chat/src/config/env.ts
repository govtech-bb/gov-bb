import { z } from "zod";

// A "1"/"true" → boolean env flag (anything else, incl. unset, is false).
const boolFlag = () =>
  z
    .string()
    .optional()
    .transform((v) => v === "1" || v === "true");

// Validated server env for the chat app.
//
// DATABASE_URL is NOT here — the data layer (src/lib/db) owns it, resolving it
// at runtime from process.env or Secrets Manager. FORM_API_URL only matters
// when the in-chat form features are enabled.
const envSchema = z.object({
  // Retrieval service base URL (usually <chat-origin>/api). Required: the
  // grounding stage cannot work without it.
  RAG_URL: z.url(),
  // Landing frontend origin for citation deep-links back to the landing site.
  // REQUIRED in production — an unset value fails fast (#1366) rather than
  // silently pointing a non-prod build's citations at prod. A dev-only default
  // is supplied in getServerEnv() below. Trailing slash stripped.
  LANDING_URL: z.url().transform((s) => s.replace(/\/+$/, "")),
  // Forms API base URL. Only used by the in-chat form tools (features.forms);
  // unset is fine when forms are off. Trailing slash stripped so paths
  // concatenate.
  FORM_API_URL: z
    .url()
    .optional()
    .transform((s) => s?.replace(/\/+$/, "")),
  // Bedrock region for the chat model + Titan embeddings. Optional; the SDK
  // falls back to AWS_REGION, then this default.
  BEDROCK_REGION: z.string().default("ca-central-1"),
  // Main chat model and the cheaper query-rewrite model. Short aliases are
  // resolved by @govtech-bb/ai-bedrock.
  LLM_MODEL: z.string().default("claude-haiku-4-5"),
  REWRITE_MODEL: z.string().default("claude-haiku-4-5"),
  // Opt-in: cache the static system prompt via a Bedrock cache point. Off
  // unless explicitly set, since caching support varies by model/region.
  BEDROCK_PROMPT_CACHE: boolFlag(),
  // In-chat form feature toggles — all default OFF, so the assistant only
  // answers questions until a feature is explicitly enabled. RAG_ONLY is a
  // master override that forces every form feature off regardless of the
  // individual flags (a one-line rollback to question-answering only). See
  // config/features.ts for how these resolve.
  FEATURE_FORMS: boolFlag(),
  FEATURE_FEEDBACK: boolFlag(),
  FEATURE_OFFERS: boolFlag(),
  RAG_ONLY: boolFlag(),
  // Fail-safe submit gate: form submission DRY-RUNS (validate + shape, no POST)
  // unless SUBMIT_LIVE is set. Keeps local/dev from writing real submissions to
  // the forms API; a deployed env opts in explicitly.
  SUBMIT_LIVE: boolFlag(),
  // Test seam: swap the Bedrock chat adapter for a scripted mock that drives a
  // deterministic forms-collection loop (lib/chat/mock-adapter.ts), and skip
  // retrieval so an E2E run needs no model/embeddings — only the real tool loop,
  // validation, and UI. Off in every normal run; set by the Playwright harness.
  LLM_MOCK: boolFlag(),
  // The formId the mock adapter drives when LLM_MOCK is on.
  LLM_MOCK_FORM: z.string().default("chat-feedback"),
  // Wall-clock ceiling (ms) for one streaming turn. The framework aborts on
  // client disconnect and the rewrite stage is bounded on its own; this caps a
  // hung upstream once the main stream is in flight so a connection can't pin
  // forever. Default 60s — generous against a maxTokens=600 answer.
  TURN_TIMEOUT_MS: z.coerce.number().int().positive().default(60_000),
  // Per-IP request cap for the public POST /api/chat endpoint, per 60s window.
  // Defense-in-depth alongside the WAF (see lib/chat/rate-limit.ts) — retune
  // here rather than widening in code. Default 20/min comfortably covers a real
  // conversation while blocking scripted floods.
  CHAT_RATE_LIMIT: z.coerce.number().int().positive().default(20),
});

export type ServerEnv = z.infer<typeof envSchema>;

// Each `process.env.X` is read as a literal so Vite's `define` substitution can
// bake it into the bundle at build time (see vite.config.ts). Parsing per call
// keeps it lazy and lets tests vary process.env.
//
// Vite bakes an *empty string* for any var with no value at build time. An
// empty string is not `undefined`, so it would defeat zod `.default()` and fail
// `.url()` — coerce "" → undefined so unset config falls back to its default.
const orUndef = (v: string | undefined): string | undefined =>
  v === "" ? undefined : v;

// A dev-only convenience default: kept only outside production. In production an
// unset value stays undefined so the schema's required check fails fast (#1366)
// rather than silently pointing at the wrong environment.
const devOnly = (
  v: string | undefined,
  devDefault: string,
): string | undefined =>
  v ?? (process.env.NODE_ENV === "production" ? undefined : devDefault);

export const getServerEnv = (): ServerEnv =>
  envSchema.parse({
    RAG_URL: orUndef(process.env.RAG_URL),
    LANDING_URL: devOnly(
      orUndef(process.env.LANDING_URL),
      "https://alpha.gov.bb",
    ),
    FORM_API_URL: orUndef(process.env.FORM_API_URL),
    BEDROCK_REGION: orUndef(process.env.BEDROCK_REGION),
    LLM_MODEL: orUndef(process.env.LLM_MODEL),
    REWRITE_MODEL: orUndef(process.env.REWRITE_MODEL),
    BEDROCK_PROMPT_CACHE: orUndef(process.env.BEDROCK_PROMPT_CACHE),
    FEATURE_FORMS: orUndef(process.env.FEATURE_FORMS),
    FEATURE_FEEDBACK: orUndef(process.env.FEATURE_FEEDBACK),
    FEATURE_OFFERS: orUndef(process.env.FEATURE_OFFERS),
    RAG_ONLY: orUndef(process.env.RAG_ONLY),
    SUBMIT_LIVE: orUndef(process.env.SUBMIT_LIVE),
    LLM_MOCK: orUndef(process.env.LLM_MOCK),
    LLM_MOCK_FORM: orUndef(process.env.LLM_MOCK_FORM),
    TURN_TIMEOUT_MS: orUndef(process.env.TURN_TIMEOUT_MS),
    CHAT_RATE_LIMIT: orUndef(process.env.CHAT_RATE_LIMIT),
  });
