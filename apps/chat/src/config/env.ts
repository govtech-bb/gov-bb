import { useRuntimeConfig } from "nitro/runtime-config";
import { z } from "zod";

const schema = z.object({
  ragUrl: z.string().url(),
  formApiUrl: z
    .string()
    .url()
    .transform((s) => s.replace(/\/+$/, "")),
  databaseUrl: z.string().url(),
  bedrockRegion: z.string(),
  llmModel: z.string(),
  rewriteModel: z.string(),
});

export function getServerEnv() {
  const cfg = schema.parse(useRuntimeConfig());
  return {
    RAG_URL: cfg.ragUrl,
    FORM_API_URL: cfg.formApiUrl,
    DATABASE_URL: cfg.databaseUrl,
    BEDROCK_REGION: cfg.bedrockRegion,
    LLM_MODEL: cfg.llmModel,
    REWRITE_MODEL: cfg.rewriteModel,
  };
}
