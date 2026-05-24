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

export const getServerEnv = () => envSchema.parse(process.env);
