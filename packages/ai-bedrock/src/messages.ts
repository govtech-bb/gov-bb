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

function textBlock(text: string): ContentBlock.TextMember {
  return { text };
}

function toolUseBlock(
  toolUseId: string,
  name: string,
  input: object,
): ContentBlock.ToolUseMember {
  return {
    toolUse: {
      toolUseId,
      name,
      input: input as ToolUseBlock["input"],
    },
  };
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

      const toolResultBlocks: Array<ContentBlock.ToolResultMember> =
        prevToolUseIds
          .map((id) => toolResultById.get(id))
          .filter((b): b is ToolResultBlock => b != null)
          .map((tr) => ({ toolResult: tr }));

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

  return fillUnansweredToolUses(out);
}

// Bedrock rejects any toolUse that isn't answered by a toolResult in the very
// next user turn. UI-only client tools (e.g. present_choices) render from their
// args and never produce a result, leaving the toolUse orphaned in history.
// Synthesize a success result for any unanswered toolUse and fold it into the
// following user message. No-op once every toolUse already has a result.
function fillUnansweredToolUses(messages: Array<Message>): Array<Message> {
  const out: Array<Message> = [];
  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i]!;
    out.push(msg);
    if (msg.role !== "assistant") continue;

    const toolUseIds = (msg.content ?? [])
      .map((b) => (b as { toolUse?: ToolUseBlock }).toolUse?.toolUseId)
      .filter((id): id is string => typeof id === "string");
    if (!toolUseIds.length) continue;

    const next = messages[i + 1];
    const answered = new Set(
      (next?.role === "user" ? (next.content ?? []) : [])
        .map(
          (b) => (b as { toolResult?: ToolResultBlock }).toolResult?.toolUseId,
        )
        .filter((id): id is string => typeof id === "string"),
    );
    const missing = toolUseIds.filter((id) => !answered.has(id));
    if (!missing.length) continue;

    const synthesized: Array<ContentBlock.ToolResultMember> = missing.map(
      (id) => ({
        toolResult: {
          toolUseId: id,
          content: [{ text: '{"shown":true}' }],
          status: "success",
        },
      }),
    );
    // Merge into the following user message (keeping role alternation) or, if
    // there isn't one, emit a user message carrying just the results.
    if (next?.role === "user") {
      out.push({
        role: "user",
        content: [...synthesized, ...(next.content ?? [])],
      });
      i++;
    } else {
      out.push({ role: "user", content: synthesized });
    }
  }
  return out;
}

export function systemPromptsToBedrock(
  prompts: Array<SystemPrompt> | undefined,
  opts: { cacheFirstBlock?: boolean } = {},
): Array<SystemContentBlock> | undefined {
  if (!prompts?.length) return undefined;
  const normalized = normalizeSystemPrompts(prompts);
  const blocks = normalized
    .map((p) => p.content)
    .filter((s) => s.trim().length > 0)
    .map((text) => ({ text }) as SystemContentBlock);
  if (!blocks.length) return undefined;
  // A cache point after the first (static) block tells Bedrock to cache that
  // prefix and reuse it on later requests; volatile blocks stay after it and
  // are re-read each turn.
  if (opts.cacheFirstBlock) {
    blocks.splice(1, 0, {
      cachePoint: { type: "default" },
    } as SystemContentBlock);
  }
  return blocks;
}

function inputSchemaToJson(
  schema: Tool["inputSchema"],
): ToolInputSchema.JsonMember {
  const json =
    schema && typeof schema === "object"
      ? schema
      : { type: "object", properties: {} };
  return { json } as ToolInputSchema.JsonMember;
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
            inputSchema: { json: schema } as ToolInputSchema.JsonMember,
          },
        },
      ],
      toolChoice: { tool: { name } },
    },
  };
}
