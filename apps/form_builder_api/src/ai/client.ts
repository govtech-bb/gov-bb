import {
  BedrockRuntimeClient,
  ConverseCommand,
} from "@aws-sdk/client-bedrock-runtime";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

let client: BedrockRuntimeClient | null = null;
let modelId = "global.anthropic.claude-haiku-4-5-20251001-v1:0";

export async function ensureInitialised(): Promise<void> {
  if (client) return;
  // AI_MODEL must be a Bedrock model ID or inference profile ID.
  // ca-central-1 doesn't support ON_DEMAND for haiku-4-5 — use an inference
  // profile (e.g. global.* or us.*).
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

export async function chat(
  systemPrompt: string,
  messages: ChatMessage[],
  pdfPages?: string[],
): Promise<string> {
  await ensureInitialised();
  if (!client) throw new Error("AI service not configured");

  const bedrockMessages = messages.map((msg, idx) => {
    if (msg.role === "user" && pdfPages && idx === 0) {
      const content: Array<Record<string, unknown>> = pdfPages.map((page) => ({
        document: {
          format: "pdf" as const,
          name: "uploaded-form",
          source: { bytes: Buffer.from(page, "base64") },
        },
      }));
      content.push({ text: msg.content });
      return { role: "user" as const, content };
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
