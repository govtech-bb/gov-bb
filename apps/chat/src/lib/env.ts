function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

export const env = {
  RAG_URL: required("RAG_URL"),
  BEDROCK_REGION: process.env.BEDROCK_REGION ?? process.env.AWS_REGION,
  LLM_MODEL: process.env.LLM_MODEL ?? "claude-haiku-4-5",
};
