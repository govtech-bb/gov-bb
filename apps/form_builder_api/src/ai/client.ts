import { getSystemPrompt } from "./system-prompt";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

let initialised = false;
let initPromise: Promise<void> | null = null;
let client: any = null;
let provider: "anthropic" | "bedrock" = "bedrock";
let model = "claude-sonnet-4-20250514";
let bedrockModelId = "us.anthropic.claude-sonnet-4-6";

export async function ensureInitialised(): Promise<void> {
  if (initialised) return;
  if (initPromise) return initPromise;
  initPromise = (async () => {
    provider = (process.env.AI_PROVIDER as "anthropic" | "bedrock") ?? "bedrock";
    model = process.env.AI_MODEL ?? "claude-sonnet-4-20250514";
    bedrockModelId = process.env.AI_MODEL ?? "us.anthropic.claude-sonnet-4-6";

    if (provider === "bedrock") {
      try {
        const { BedrockRuntimeClient } = await import("@aws-sdk/client-bedrock-runtime");
        client = new BedrockRuntimeClient({
          region: process.env.BEDROCK_REGION ?? process.env.AWS_REGION ?? "ca-central-1",
        });
      } catch {
        console.warn("@aws-sdk/client-bedrock-runtime not available — AI disabled");
      }
    } else {
      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (!apiKey) {
        console.warn("ANTHROPIC_API_KEY not set — AI disabled");
      } else {
        try {
          const { default: Anthropic } = await import("@anthropic-ai/sdk");
          client = new Anthropic({ apiKey });
        } catch {
          console.warn("@anthropic-ai/sdk not available — AI disabled");
        }
      }
    }
    initialised = true;
  })();
  return initPromise;
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

  if (provider === "bedrock") {
    return chatBedrock(systemPrompt, messages, pdfPages);
  }
  return chatAnthropic(systemPrompt, messages, pdfPages);
}

async function chatAnthropic(
  systemPrompt: string,
  messages: ChatMessage[],
  pdfPages?: string[],
): Promise<string> {
  const apiMessages = messages.map((msg, idx) => {
    if (msg.role === "user" && pdfPages && idx === 0) {
      const content: any[] = pdfPages.map((page) => ({
        type: "image",
        source: { type: "base64", media_type: "image/png", data: page },
      }));
      content.push({ type: "text", text: msg.content });
      return { role: "user" as const, content };
    }
    return { role: msg.role as "user" | "assistant", content: msg.content };
  });
  const response = await client.messages.create({
    model,
    max_tokens: 8192,
    system: systemPrompt,
    messages: apiMessages,
  });
  const textBlock = response.content.find((block: any) => block.type === "text");
  return textBlock?.text ?? "";
}

async function chatBedrock(
  systemPrompt: string,
  messages: ChatMessage[],
  pdfPages?: string[],
): Promise<string> {
  const { ConverseCommand } = await import("@aws-sdk/client-bedrock-runtime");
  const bedrockMessages = messages.map((msg, idx) => {
    if (msg.role === "user" && pdfPages && idx === 0) {
      const content: any[] = pdfPages.map((page) => ({
        document: {
          format: "pdf" as const,
          name: "uploaded-form",
          source: { bytes: Buffer.from(page, "base64") },
        },
      }));
      content.push({ text: msg.content });
      return { role: "user" as const, content };
    }
    return { role: msg.role as "user" | "assistant", content: [{ text: msg.content }] };
  });
  const command = new ConverseCommand({
    modelId: bedrockModelId,
    system: [{ text: systemPrompt }],
    messages: bedrockMessages as any,
    inferenceConfig: { maxTokens: 16384 },
  });
  const response = await client.send(command);
  const textBlock = response.output?.message?.content?.find((b: any) => b.text);
  return textBlock?.text ?? "";
}

