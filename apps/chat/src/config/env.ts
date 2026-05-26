import { z } from "zod";

const envSchema = z.object({
  RAG_URL: z.string().url(),
  FORM_API_URL: z
    .string()
    .url()
    .transform((s) => s.replace(/\/+$/, "")),
  DATABASE_URL: z.string().url(),
  BEDROCK_REGION: z.string().optional(),
  LLM_MODEL: z.string().default("claude-haiku-4-5"),
  REWRITE_MODEL: z.string().default("claude-haiku-4-5"),
});

// Each `process.env.X` is a literal so Vite's `define` substitution can
// bake it into the bundle at build time. Passing `process.env` directly
// would defeat the substitution and leave fields undefined on Amplify.
export const getServerEnv = () =>
  envSchema.parse({
    RAG_URL: process.env.RAG_URL,
    FORM_API_URL: process.env.FORM_API_URL,
    DATABASE_URL: process.env.DATABASE_URL,
    BEDROCK_REGION: process.env.BEDROCK_REGION,
    LLM_MODEL: process.env.LLM_MODEL,
    REWRITE_MODEL: process.env.REWRITE_MODEL,
  });
