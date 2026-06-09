import {
  BedrockRuntimeClient,
  ConverseCommand,
} from "@aws-sdk/client-bedrock-runtime";

let client: BedrockRuntimeClient | null = null;
let modelId = "global.anthropic.claude-haiku-4-5-20251001-v1:0";

export async function ensureInitialised(): Promise<void> {
  if (client) return;
  modelId = process.env.AI_MODEL ?? modelId;
  client = new BedrockRuntimeClient({
    region:
      process.env.BEDROCK_REGION ?? process.env.AWS_REGION ?? "ca-central-1",
  });
}

export async function isAvailable(): Promise<boolean> {
  await ensureInitialised();
  return !!client;
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

// chat sends a single Converse call to Claude on Bedrock. When documentText is
// present, it's prepended as a separate text content block on the user's first
// message — Claude reads it as the form being converted. The previous PDF
// document-block path was retired with the Textract converter (see spec
// 2026-06-09-form-builder-pdf-textract-converter-design.md).
export async function chat(
  systemPrompt: string,
  messages: ChatMessage[],
  documentText?: string,
): Promise<string> {
  await ensureInitialised();
  if (!client) throw new Error("AI service not configured");

  const bedrockMessages = messages.map((msg, idx) => {
    if (msg.role === "user" && documentText && idx === 0) {
      return {
        role: "user" as const,
        content: [{ text: documentText }, { text: msg.content }],
      };
    }
    return {
      role: msg.role as "user" | "assistant",
      content: [{ text: msg.content }],
    };
  });

  const command = new ConverseCommand({
    modelId,
    system: [{ text: systemPrompt }],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    messages: bedrockMessages as any,
    inferenceConfig: { maxTokens: 16384 },
  });
  const response = await client.send(command);
  const textBlock = response.output?.message?.content?.find(
    (b: { text?: string }) => b.text,
  );
  return textBlock?.text ?? "";
}
