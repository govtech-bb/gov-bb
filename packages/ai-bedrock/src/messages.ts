import type {
  ContentBlock,
  Message,
  SystemContentBlock,
  Tool as BedrockTool,
  ToolConfiguration,
  ToolInputSchema,
  ToolResultBlock,
  ToolUseBlock,
} from "@aws-sdk/client-bedrock-runtime";
import type {
  ContentPart,
  JSONSchema,
  ModelMessage,
  SystemPrompt,
  Tool,
} from "@tanstack/ai";
import { normalizeSystemPrompts } from "@tanstack/ai";

type TextContentPart = Extract<ContentPart, { type: "text" }>;

export function getTextFromContent(
  content: string | null | Array<ContentPart>,
): string {
  if (content == null) return "";
  if (typeof content === "string") return content;
  return content
    .filter((p): p is TextContentPart => p.type === "text")
    .map((p) => p.content)
    .join("");
}

function textBlock(text: string): ContentBlock {
  return { text } as ContentBlock;
}

function toolUseBlock(
  toolUseId: string,
  name: string,
  input: object,
): ContentBlock {
  return {
    toolUse: {
      toolUseId,
      name,
      input: input as ToolUseBlock["input"],
    },
  } as ContentBlock;
}

function parseToolArguments(raw: string | object | undefined): object {
  if (raw == null) return {};
  if (typeof raw === "object") return raw;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : { value: raw };
  } catch {
    return { value: raw };
  }
}

// ModelMessage → Bedrock Message[]. Bedrock requires strictly alternating
// user/assistant roles; tool results are emitted as role:'user' messages
// containing tool_result blocks that line up with the preceding assistant
// tool_use blocks. A single ModelMessage with `role: 'tool'` carries the
// result for ONE toolCallId — multiple parallel tool calls produce multiple
// consecutive tool messages, which we coalesce into a single user message.
export function modelMessagesToBedrock(
  messages: Array<ModelMessage>,
): Array<Message> {
  const out: Array<Message> = [];

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i]!;

    if (msg.role === "user") {
      const text = getTextFromContent(msg.content);
      out.push({ role: "user", content: [textBlock(text)] });
      continue;
    }

    if (msg.role === "tool" && msg.toolCallId) {
      // Find the last assistant message and collect the ids of its toolUse
      // blocks so we can emit tool_result blocks in the same order Bedrock
      // expects.
      const prev = out[out.length - 1];
      const prevContent: Array<ContentBlock> =
        prev?.role === "assistant" ? (prev.content ?? []) : [];
      const prevToolUseIds = prevContent
        .map((b) => (b as { toolUse?: ToolUseBlock }).toolUse?.toolUseId)
        .filter((id): id is string => typeof id === "string");

      const toolResultById = new Map<string, ToolResultBlock>();
      while (i < messages.length && messages[i]?.role === "tool") {
        const toolMsg = messages[i]!;
        const toolCallId = toolMsg.toolCallId;
        if (toolCallId) {
          const text =
            typeof toolMsg.content === "string"
              ? toolMsg.content
              : JSON.stringify(toolMsg.content);
          toolResultById.set(toolCallId, {
            toolUseId: toolCallId,
            content: [{ text }],
            status: "success",
          });
        }
        i++;
      }
      i--;

      const toolResultBlocks: Array<ContentBlock> = prevToolUseIds
        .map((id) => toolResultById.get(id))
        .filter((b): b is ToolResultBlock => b != null)
        .map((tr) => ({ toolResult: tr }) as ContentBlock);

      if (toolResultBlocks.length > 0) {
        out.push({ role: "user", content: toolResultBlocks });
      }
      continue;
    }

    if (msg.role === "assistant") {
      const blocks: Array<ContentBlock> = [];
      const text = getTextFromContent(msg.content);
      const hasToolCalls = msg.toolCalls && msg.toolCalls.length > 0;

      if (text) blocks.push(textBlock(text));
      if (hasToolCalls) {
        for (const tc of msg.toolCalls!) {
          blocks.push(
            toolUseBlock(
              tc.id,
              tc.function.name,
              parseToolArguments(tc.function.arguments),
            ),
          );
        }
      }

      if (blocks.length) out.push({ role: "assistant", content: blocks });
    }
  }

  return out;
}

export function systemPromptsToBedrock(
  prompts: Array<SystemPrompt> | undefined,
): Array<SystemContentBlock> | undefined {
  if (!prompts?.length) return undefined;
  const normalized = normalizeSystemPrompts(prompts);
  const blocks = normalized
    .map((p) => p.content)
    .filter((s) => s.trim().length > 0)
    .map((text) => ({ text }) as SystemContentBlock);
  return blocks.length ? blocks : undefined;
}

// Bedrock's `ToolInputSchema` is a smithy discriminated union (`{ json } |
// { $unknown }`) where the `json` payload is `__DocumentType`. JSON Schema
// objects fit that shape at runtime, but TS picks the wrong arm for plain
// object literals — cast through `unknown` once here and the rest of the
// file stays clean.
function inputSchemaToJson(schema: Tool["inputSchema"]): ToolInputSchema {
  const json =
    schema && typeof schema === "object"
      ? schema
      : { type: "object", properties: {} };
  return { json } as unknown as ToolInputSchema;
}

export function toolsToBedrockToolConfig(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- mirrors `tools?: Array<Tool<any, any, any>>` on TextOptions
  tools: Array<Tool<any, any, any>> | undefined,
): ToolConfiguration | undefined {
  if (!tools?.length) return undefined;
  return {
    tools: tools.map(
      (t): BedrockTool => ({
        toolSpec: {
          name: t.name,
          description: t.description ?? "",
          inputSchema: inputSchemaToJson(t.inputSchema),
        },
      }),
    ),
  };
}

export function jsonSchemaToBedrockStructuredTool(
  schema: JSONSchema,
  name = "structured_output",
  description = "Use this tool to provide your response in the required structured format.",
): { toolConfig: ToolConfiguration; toolName: string } {
  return {
    toolName: name,
    toolConfig: {
      tools: [
        {
          toolSpec: {
            name,
            description,
            inputSchema: { json: schema } as unknown as ToolInputSchema,
          },
        },
      ],
      toolChoice: { tool: { name } },
    },
  };
}
