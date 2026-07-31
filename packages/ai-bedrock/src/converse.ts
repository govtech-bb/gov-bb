import {
  BedrockRuntimeClient,
  ConverseCommand,
  type Message,
} from "@aws-sdk/client-bedrock-runtime";
import { resolveBedrockModelId } from "./models.js";

const DEFAULT_REGION =
  process.env.BEDROCK_REGION ?? process.env.AWS_REGION ?? "ca-central-1";

// Cap the Bedrock round-trip so a stuck socket can't hang the caller forever
// (the sync /builder/ai/content route, and the edit/upload job path that would
// otherwise leak a permanently-"running" job) (#2080). Generous enough for a
// full LLM generation (maxTokens up to 16384), but finite.
const BEDROCK_TIMEOUT_MS = 90_000;

export interface ConverseMessage {
  role: "user" | "assistant";
  content: string;
}

export interface BedrockConverseOptions {
  /** Model alias or raw Bedrock model/inference-profile id. */
  model: string;
  system: string;
  messages: ConverseMessage[];
  /**
   * When present, prepended as a separate text block on the first user
   * message — Claude reads it as the document being converted.
   */
  documentText?: string;
  region?: string;
  maxTokens?: number;
  /** Inject a client (tests); otherwise a lazily-built singleton is reused. */
  client?: BedrockRuntimeClient;
}

let cachedClient: BedrockRuntimeClient | null = null;

// One-shot, non-streaming Converse call to Claude on Bedrock. The model id is
// resolved through the shared alias map (resolveBedrockModelId), so callers can
// pass a short alias or a raw profile id (e.g. a `global.*` inference profile,
// which passes through unchanged).
export async function bedrockConverse(
  opts: BedrockConverseOptions,
): Promise<string> {
  const client =
    opts.client ??
    (cachedClient ??= new BedrockRuntimeClient({
      region: opts.region ?? DEFAULT_REGION,
    }));

  const messages: Message[] = opts.messages.map((msg, idx) => {
    if (msg.role === "user" && opts.documentText && idx === 0) {
      return {
        role: "user",
        content: [{ text: opts.documentText }, { text: msg.content }],
      };
    }
    return { role: msg.role, content: [{ text: msg.content }] };
  });

  const command = new ConverseCommand({
    modelId: resolveBedrockModelId(opts.model),
    system: [{ text: opts.system }],
    messages,
    inferenceConfig: { maxTokens: opts.maxTokens ?? 16384 },
  });

  const response = await client.send(command, {
    abortSignal: AbortSignal.timeout(BEDROCK_TIMEOUT_MS),
  });
  const textBlock = response.output?.message?.content?.find((b) => b.text);
  return textBlock?.text ?? "";
}
