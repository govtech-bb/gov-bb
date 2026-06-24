import type { BedrockRuntimeClient } from "@aws-sdk/client-bedrock-runtime";
import { bedrockConverse } from "./converse";

type SentCommand = { input: Record<string, unknown> };

function mockClient(text: string) {
  const send = vi.fn().mockResolvedValue({
    output: { message: { content: [{ text }] } },
  });
  return {
    client: { send } as unknown as BedrockRuntimeClient,
    lastInput: () => (send.mock.calls[0][0] as SentCommand).input,
  };
}

describe("bedrockConverse", () => {
  it("returns the assistant text block", async () => {
    const { client } = mockClient("hello there");
    const result = await bedrockConverse({
      client,
      model: "claude-haiku-4-5",
      system: "be brief",
      messages: [{ role: "user", content: "hi" }],
    });
    expect(result).toBe("hello there");
  });

  it("resolves a known alias to its inference-profile id", async () => {
    const { client, lastInput } = mockClient("ok");
    await bedrockConverse({
      client,
      model: "claude-haiku-4-5",
      system: "s",
      messages: [{ role: "user", content: "hi" }],
    });
    expect(lastInput().modelId).toBe(
      "us.anthropic.claude-haiku-4-5-20251001-v1:0",
    );
  });

  it("passes an unknown model id (e.g. a global.* profile) through unchanged", async () => {
    const { client, lastInput } = mockClient("ok");
    await bedrockConverse({
      client,
      model: "global.anthropic.claude-haiku-4-5-20251001-v1:0",
      system: "s",
      messages: [{ role: "user", content: "hi" }],
    });
    expect(lastInput().modelId).toBe(
      "global.anthropic.claude-haiku-4-5-20251001-v1:0",
    );
  });

  it("prepends documentText as a separate text block on the first user message", async () => {
    const { client, lastInput } = mockClient("ok");
    await bedrockConverse({
      client,
      model: "m",
      system: "s",
      messages: [
        { role: "user", content: "convert this" },
        { role: "assistant", content: "sure" },
      ],
      documentText: "FORM BODY",
    });
    expect(lastInput().messages).toEqual([
      {
        role: "user",
        content: [{ text: "FORM BODY" }, { text: "convert this" }],
      },
      { role: "assistant", content: [{ text: "sure" }] },
    ]);
  });

  it("defaults maxTokens to 16384 and forwards system + override", async () => {
    const { client, lastInput } = mockClient("ok");
    await bedrockConverse({
      client,
      model: "m",
      system: "system prompt",
      messages: [{ role: "user", content: "hi" }],
    });
    const input = lastInput();
    expect(input.inferenceConfig).toEqual({ maxTokens: 16384 });
    expect(input.system).toEqual([{ text: "system prompt" }]);

    const { client: c2, lastInput: li2 } = mockClient("ok");
    await bedrockConverse({
      client: c2,
      model: "m",
      system: "s",
      messages: [{ role: "user", content: "hi" }],
      maxTokens: 4096,
    });
    expect(li2().inferenceConfig).toEqual({ maxTokens: 4096 });
  });

  it("returns an empty string when the response has no text block", async () => {
    const send = vi
      .fn()
      .mockResolvedValue({ output: { message: { content: [] } } });
    const client = { send } as unknown as BedrockRuntimeClient;
    const result = await bedrockConverse({
      client,
      model: "m",
      system: "s",
      messages: [{ role: "user", content: "hi" }],
    });
    expect(result).toBe("");
  });
});
