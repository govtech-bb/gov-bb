import { getSystemPrompt } from "./prompts/system-prompt";
import type { ChatMessage } from "./types";

let initialised = false;
let initPromise: Promise<void> | null = null;
let client: any = null;
let provider: "anthropic" | "bedrock" = "anthropic";
let model = "claude-sonnet-4-20250514";
let bedrockModelId = "us.anthropic.claude-sonnet-4-6";
let systemPrompt = "";

export async function ensureInitialised(): Promise<void> {
  if (initialised) return;
  if (initPromise) return initPromise;
  initPromise = (async () => {
    systemPrompt = getSystemPrompt();
    provider =
      (process.env.AI_PROVIDER as "anthropic" | "bedrock") ?? "anthropic";
    model = process.env.AI_MODEL ?? "claude-sonnet-4-20250514";
    bedrockModelId = process.env.AI_MODEL ?? "us.anthropic.claude-sonnet-4-6";
    if (provider === "bedrock") {
      try {
        const { BedrockRuntimeClient } =
          await import("@aws-sdk/client-bedrock-runtime");
        client = new BedrockRuntimeClient({
          region: process.env.AWS_REGION ?? "us-east-1",
        });
      } catch {
        console.warn(
          "@aws-sdk/client-bedrock-runtime not installed — AI features disabled",
        );
      }
    } else {
      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (!apiKey) {
        console.warn("ANTHROPIC_API_KEY not set — AI features will not work");
      } else {
        try {
          const { default: Anthropic } = await import("@anthropic-ai/sdk");
          client = new Anthropic({ apiKey });
        } catch {
          console.warn(
            "@anthropic-ai/sdk not installed — AI features disabled",
          );
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

export async function buildSystemPromptFor(
  customComponentsList: string,
): Promise<string> {
  await ensureInitialised();
  if (!customComponentsList) return systemPrompt;
  return `${systemPrompt}\n\n## Live Custom Components (from database)\n${customComponentsList}`;
}

export async function chat(
  sessionSystemPrompt: string,
  messages: ChatMessage[],
  pdfPages?: string[],
): Promise<string> {
  await ensureInitialised();
  if (!client) {
    throw new Error("AI service not configured. Set ANTHROPIC_API_KEY.");
  }
  if (provider === "bedrock") {
    return chatBedrock(sessionSystemPrompt, messages, pdfPages);
  }
  return chatAnthropic(sessionSystemPrompt, messages, pdfPages);
}

async function chatAnthropic(
  sessionSystemPrompt: string,
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
    system: sessionSystemPrompt,
    messages: apiMessages,
  });
  const textBlock = response.content.find(
    (block: any) => block.type === "text",
  );
  return textBlock?.text ?? "";
}

async function chatBedrock(
  sessionSystemPrompt: string,
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
    return {
      role: msg.role as "user" | "assistant",
      content: [{ text: msg.content }],
    };
  });
  const command = new ConverseCommand({
    modelId: bedrockModelId,
    system: [{ text: sessionSystemPrompt }],
    messages: bedrockMessages as any,
    inferenceConfig: { maxTokens: 16384 },
  });
  const response = await client.send(command);
  const textBlock = response.output?.message?.content?.find((b: any) => b.text);
  return textBlock?.text ?? "";
}
