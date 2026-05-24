/**
 * Bedrock adapter for @tanstack/ai chat() function.
 *
 * Uses the Bedrock ConverseStream API to stream Claude responses.
 * Matches the adapter interface expected by @tanstack/ai's chat().
 */
import {
  BedrockRuntimeClient,
  ConverseStreamCommand,
  type Message as BedrockMessage,
  type ContentBlock,
  type SystemContentBlock,
  type ToolConfiguration,
  type Tool,
} from "@aws-sdk/client-bedrock-runtime";
import type { ChatAdapter, StreamChunk, SystemPrompt, UIMessage } from "@tanstack/ai";

const region = process.env.BEDROCK_REGION ?? process.env.AWS_REGION ?? "ca-central-1";

let client: BedrockRuntimeClient | null = null;
function getClient(): BedrockRuntimeClient {
  if (!client) {
    client = new BedrockRuntimeClient({ region });
  }
  return client;
}

interface BedrockTextOptions {
  maxTokens?: number;
  temperature?: number;
}

/**
 * Convert @tanstack/ai UIMessages to Bedrock Converse message format.
 */
function toBedrockMessages(messages: UIMessage[]): BedrockMessage[] {
  return messages
    .filter((m) => m.role === "user" || m.role === "assistant")
    .map((m) => ({
      role: m.role as "user" | "assistant",
      content: [{ text: typeof m.content === "string" ? m.content : JSON.stringify(m.content) }] as ContentBlock[],
    }));
}

/**
 * Convert system prompts to Bedrock system format.
 */
function toBedrockSystem(systemPrompts: SystemPrompt<unknown>[]): SystemContentBlock[] {
  return systemPrompts.map((sp) => {
    const text = typeof sp === "string" ? sp : (sp as { content: string }).content;
    return { text } as SystemContentBlock;
  });
}

/**
 * Convert @tanstack/ai tool definitions to Bedrock tool config.
 */
function toBedrockToolConfig(tools: any[]): ToolConfiguration | undefined {
  if (!tools || tools.length === 0) return undefined;

  const bedrockTools: Tool[] = tools.map((t) => ({
    toolSpec: {
      name: t.name,
      description: t.description ?? "",
      inputSchema: {
        json: t.parameters ?? {},
      },
    },
  }));

  return { tools: bedrockTools };
}

/**
 * Creates a Bedrock adapter compatible with @tanstack/ai chat().
 */
export function bedrockText(
  modelId: string,
  options: BedrockTextOptions = {},
): ChatAdapter {
  const { maxTokens = 600, temperature = 0.3 } = options;

  return {
    name: "bedrock",

    async *stream({ messages, systemPrompts, tools, abortSignal }) {
      const bedrockMessages = toBedrockMessages(messages as UIMessage[]);
      const system = toBedrockSystem(systemPrompts ?? []);
      const toolConfig = toBedrockToolConfig(tools ?? []);

      const command = new ConverseStreamCommand({
        modelId,
        messages: bedrockMessages,
        system,
        inferenceConfig: {
          maxTokens,
          temperature,
        },
        ...(toolConfig ? { toolConfig } : {}),
      });

      const response = await getClient().send(command, {
        abortSignal,
      });

      if (!response.stream) {
        return;
      }

      let currentToolName = "";
      let currentToolId = "";
      let toolInputJson = "";

      for await (const event of response.stream) {
        if (abortSignal?.aborted) break;

        if (event.contentBlockStart?.start?.toolUse) {
          currentToolName = event.contentBlockStart.start.toolUse.name ?? "";
          currentToolId = event.contentBlockStart.start.toolUse.toolUseId ?? "";
          toolInputJson = "";
        }

        if (event.contentBlockDelta?.delta?.text) {
          yield {
            type: "TEXT",
            content: event.contentBlockDelta.delta.text,
          } as StreamChunk;
        }

        if (event.contentBlockDelta?.delta?.toolUse) {
          toolInputJson += event.contentBlockDelta.delta.toolUse.input ?? "";
        }

        if (event.contentBlockStop && currentToolName) {
          let args = {};
          try {
            args = JSON.parse(toolInputJson);
          } catch {
            args = {};
          }
          yield {
            type: "TOOL_CALL",
            name: currentToolName,
            id: currentToolId,
            args,
          } as unknown as StreamChunk;
          currentToolName = "";
          currentToolId = "";
          toolInputJson = "";
        }

        if (event.messageStop) {
          break;
        }
      }
    },
  } as unknown as ChatAdapter;
}
