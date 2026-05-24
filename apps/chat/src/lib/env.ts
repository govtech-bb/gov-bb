function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

export const env = {
  RAG_URL: required("RAG_URL"),
  ANTHROPIC_API_KEY: required("ANTHROPIC_API_KEY"),
  LLM_MODEL: process.env.LLM_MODEL ?? "claude-haiku-4-5",
};
