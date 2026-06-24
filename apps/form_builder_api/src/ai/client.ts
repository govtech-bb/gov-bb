import { bedrockConverse } from "@govtech-bb/ai-bedrock/converse";

// ca-central-1 has no ON_DEMAND haiku-4-5, so the default targets a `global.*`
// inference profile. AI_MODEL overrides it; aliases are expanded by
// @govtech-bb/ai-bedrock's resolveBedrockModelId, raw ids pass through.
const DEFAULT_MODEL = "global.anthropic.claude-haiku-4-5-20251001-v1:0";

export async function isAvailable(): Promise<boolean> {
  return true;
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

// chat sends a single Converse call to Claude on Bedrock via the shared
// @govtech-bb/ai-bedrock client. When documentText is present, it's prepended
// as a separate text content block on the user's first message — Claude reads
// it as the form being converted. The previous PDF document-block path was
// retired with the Textract converter (see spec
// 2026-06-09-form-builder-pdf-textract-converter-design.md).
export async function chat(
  systemPrompt: string,
  messages: ChatMessage[],
  documentText?: string,
): Promise<string> {
  return bedrockConverse({
    model: process.env.AI_MODEL ?? DEFAULT_MODEL,
    system: systemPrompt,
    messages,
    documentText,
  });
}
