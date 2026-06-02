import type { ModelMessage, SystemPrompt, Tool } from "@tanstack/ai";
import {
  jsonSchemaToBedrockStructuredTool,
  modelMessagesToBedrock,
  systemPromptsToBedrock,
  toolsToBedrockToolConfig,
} from "./messages";

describe("modelMessagesToBedrock", () => {
  it("converts a plain user → assistant exchange", () => {
    const messages: Array<ModelMessage> = [
      { role: "user", content: "hi" },
      { role: "assistant", content: "hello" },
    ];
    expect(modelMessagesToBedrock(messages)).toEqual([
      { role: "user", content: [{ text: "hi" }] },
      { role: "assistant", content: [{ text: "hello" }] },
    ]);
  });

  it("extracts text from a structured content array", () => {
    const messages: Array<ModelMessage> = [
      {
        role: "user",
        content: [
          { type: "text", content: "part one " },
          { type: "text", content: "part two" },
        ],
      },
    ];
    expect(modelMessagesToBedrock(messages)).toEqual([
      { role: "user", content: [{ text: "part one part two" }] },
    ]);
  });

  it("emits a single user message with tool_result blocks in tool_use order", () => {
    const messages: Array<ModelMessage> = [
      { role: "user", content: "do both things" },
      {
        role: "assistant",
        content: "",
        toolCalls: [
          {
            id: "tool-1",
            type: "function",
            function: { name: "lookup", arguments: '{"q":"a"}' },
          },
          {
            id: "tool-2",
            type: "function",
            function: { name: "lookup", arguments: '{"q":"b"}' },
          },
        ],
      },
      // Bedrock-side intentionally reverse-ordered to confirm we reorder by tool_use id
      { role: "tool", toolCallId: "tool-2", content: "B" },
      { role: "tool", toolCallId: "tool-1", content: "A" },
      { role: "assistant", content: "done" },
    ];

    const out = modelMessagesToBedrock(messages);
    expect(out).toHaveLength(4);
    expect(out[0]).toEqual({
      role: "user",
      content: [{ text: "do both things" }],
    });
    expect(out[1]?.role).toBe("assistant");
    expect(out[2]?.role).toBe("user");
    const resultBlocks = (out[2]?.content ?? []) as Array<{
      toolResult?: { toolUseId?: string };
    }>;
    expect(resultBlocks.map((b) => b.toolResult?.toolUseId)).toEqual([
      "tool-1",
      "tool-2",
    ]);
    expect(out[3]).toEqual({ role: "assistant", content: [{ text: "done" }] });
  });

  it("places assistant text before tool_use blocks", () => {
    const messages: Array<ModelMessage> = [
      { role: "user", content: "x" },
      {
        role: "assistant",
        content: "thinking...",
        toolCalls: [
          {
            id: "tool-1",
            type: "function",
            function: { name: "f", arguments: '{"a":1}' },
          },
        ],
      },
    ];
    const out = modelMessagesToBedrock(messages);
    const blocks = out[1]?.content ?? [];
    expect(blocks).toHaveLength(2);
    expect((blocks[0] as { text?: string }).text).toBe("thinking...");
    expect((blocks[1] as { toolUse?: { name?: string } }).toolUse?.name).toBe(
      "f",
    );
  });

  it("synthesizes a tool_result for an unanswered toolUse and folds it into the next user message", () => {
    const messages: Array<ModelMessage> = [
      { role: "user", content: "birth certificate" },
      {
        role: "assistant",
        content: "Great, let's start.",
        toolCalls: [
          {
            id: "tc-1",
            type: "function",
            function: {
              name: "present_choices",
              arguments: '{"question":"?"}',
            },
          },
        ],
      },
      { role: "user", content: "Mr" },
    ];
    const out = modelMessagesToBedrock(messages);
    expect(out).toHaveLength(3);
    expect(out[1]?.role).toBe("assistant");
    // The user's answer and the synthesized result share one user message so
    // role alternation holds and the toolUse is answered.
    expect(out[2]?.role).toBe("user");
    const blocks = (out[2]?.content ?? []) as Array<{
      toolResult?: { toolUseId?: string };
      text?: string;
    }>;
    expect(blocks[0]?.toolResult?.toolUseId).toBe("tc-1");
    expect(blocks.some((b) => b.text === "Mr")).toBe(true);
  });

  it("answers a text-less toolUse-only assistant message without creating consecutive user turns", () => {
    const messages: Array<ModelMessage> = [
      { role: "user", content: "next field" },
      {
        role: "assistant",
        content: "",
        toolCalls: [
          {
            id: "tc-2",
            type: "function",
            function: { name: "present_choices", arguments: "{}" },
          },
        ],
      },
      { role: "user", content: "Mrs" },
    ];
    const out = modelMessagesToBedrock(messages);
    expect(out.map((m) => m.role)).toEqual(["user", "assistant", "user"]);
    const blocks = (out[2]?.content ?? []) as Array<{
      toolResult?: { toolUseId?: string };
    }>;
    expect(blocks[0]?.toolResult?.toolUseId).toBe("tc-2");
  });

  it("leaves answered toolUses untouched (synthesis is a no-op)", () => {
    const messages: Array<ModelMessage> = [
      {
        role: "assistant",
        content: "",
        toolCalls: [
          {
            id: "tc-3",
            type: "function",
            function: {
              name: "set_field",
              arguments: '{"fieldId":"a","value":"b"}',
            },
          },
        ],
      },
      { role: "tool", toolCallId: "tc-3", content: '{"ok":true}' },
    ];
    const out = modelMessagesToBedrock(messages);
    expect(out).toHaveLength(2);
    const blocks = (out[1]?.content ?? []) as Array<{
      toolResult?: { toolUseId?: string; content?: Array<{ text?: string }> };
    }>;
    expect(blocks).toHaveLength(1);
    expect(blocks[0]?.toolResult?.content?.[0]?.text).toBe('{"ok":true}');
  });

  it("falls back to { value } when tool arguments are not valid JSON", () => {
    const messages: Array<ModelMessage> = [
      {
        role: "assistant",
        content: "",
        toolCalls: [
          {
            id: "tool-1",
            type: "function",
            function: { name: "f", arguments: "not-json" },
          },
        ],
      },
    ];
    const out = modelMessagesToBedrock(messages);
    const tu = (out[0]?.content?.[0] as { toolUse?: { input?: unknown } })
      .toolUse;
    expect(tu?.input).toEqual({ value: "not-json" });
  });
});

describe("systemPromptsToBedrock", () => {
  it("returns undefined for empty/missing prompts", () => {
    expect(systemPromptsToBedrock(undefined)).toBeUndefined();
    expect(systemPromptsToBedrock([])).toBeUndefined();
    expect(systemPromptsToBedrock(["   "])).toBeUndefined();
  });

  it("normalises strings and metadata-objects to text blocks", () => {
    const prompts: Array<SystemPrompt> = [
      "you are helpful",
      { content: "be concise" },
    ];
    expect(systemPromptsToBedrock(prompts)).toEqual([
      { text: "you are helpful" },
      { text: "be concise" },
    ]);
  });

  it("inserts a cache point after the first block when cacheFirstBlock is set", () => {
    const prompts: Array<SystemPrompt> = ["static prompt", "volatile context"];
    expect(systemPromptsToBedrock(prompts, { cacheFirstBlock: true })).toEqual([
      { text: "static prompt" },
      { cachePoint: { type: "default" } },
      { text: "volatile context" },
    ]);
  });

  it("does not insert a cache point by default", () => {
    expect(systemPromptsToBedrock(["only block"])).toEqual([
      { text: "only block" },
    ]);
  });
});

describe("toolsToBedrockToolConfig", () => {
  it("returns undefined when no tools", () => {
    expect(toolsToBedrockToolConfig(undefined)).toBeUndefined();
    expect(toolsToBedrockToolConfig([])).toBeUndefined();
  });

  it("wraps each tool in a toolSpec with json input schema", () => {
    const tools: Array<Tool<unknown, unknown, string>> = [
      {
        name: "get_weather",
        description: "Get weather",
        inputSchema: {
          type: "object",
          properties: { city: { type: "string" } },
          required: ["city"],
        },
      },
    ];
    expect(toolsToBedrockToolConfig(tools)).toEqual({
      tools: [
        {
          toolSpec: {
            name: "get_weather",
            description: "Get weather",
            inputSchema: {
              json: {
                type: "object",
                properties: { city: { type: "string" } },
                required: ["city"],
              },
            },
          },
        },
      ],
    });
  });

  it("supplies an empty object schema when inputSchema is missing", () => {
    const tools: Array<Tool<unknown, unknown, string>> = [
      { name: "noop", description: "", inputSchema: undefined },
    ];
    expect(
      toolsToBedrockToolConfig(tools)?.tools?.[0]?.toolSpec?.inputSchema,
    ).toEqual({ json: { type: "object", properties: {} } });
  });
});

describe("jsonSchemaToBedrockStructuredTool", () => {
  it("forces a single named tool with the supplied schema", () => {
    const result = jsonSchemaToBedrockStructuredTool({
      type: "object",
      properties: { foo: { type: "string" } },
      required: ["foo"],
    });
    expect(result.toolName).toBe("structured_output");
    expect(result.toolConfig.toolChoice).toEqual({
      tool: { name: "structured_output" },
    });
    expect(result.toolConfig.tools).toHaveLength(1);
    expect(result.toolConfig.tools?.[0]?.toolSpec?.name).toBe(
      "structured_output",
    );
  });
});
