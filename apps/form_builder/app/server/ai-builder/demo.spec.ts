import { ChatClient } from "@tanstack/ai-client";
import { toolDefinition } from "@tanstack/ai";
import { proposeContentTool, type AiContext } from "@govtech-bb/form-builder";
import { streamDemo } from "./demo";

it("runs the scripted demo through native approval, respects the read-only capability, and rejects production", async () => {
  const context: AiContext = {
    kind: "content",
    documentId: "demo-page",
    revision: "one",
    mode: "edit",
    document: { title: "Apply for a library card", body: "Original page." },
    services: [],
    attachments: [],
  };
  const apply = vi.fn((_proposal: unknown) => ({
    applied: true,
    message: "Applied to demo",
  }));
  const client = new ChatClient({
    threadId: "demo-test",
    tools: [toolDefinition(proposeContentTool).client(apply)],
    fetcher: (input, { signal }) => streamDemo(input, context, signal),
  });
  vi.stubEnv("NODE_ENV", "development");
  try {
    await client.sendMessage("Make this page easier to understand");
    expect(apply).not.toHaveBeenCalled();
    const approval = client.getInterrupts()[0];
    expect(approval?.kind).toBe("tool-approval");
    if (approval?.kind !== "tool-approval") throw new Error("Missing approval");
    approval.resolveInterrupt(true);
    await vi.waitFor(() => expect(apply).toHaveBeenCalledTimes(1));
    await vi.waitFor(() =>
      expect(JSON.stringify(client.getMessages())).toContain(
        "Updated the demo draft.",
      ),
    );
    await vi.waitFor(() => expect(client.getInterrupts()).toHaveLength(0));
    await vi.waitFor(() => expect(client.getIsLoading()).toBe(false));
    expect(apply.mock.calls[0]?.[0]).toMatchObject({
      patch: { title: "Get a library card" },
    });

    context.mode = "ask";
    await client.sendMessage("What would you improve?");
    expect(client.getInterrupts()).toHaveLength(0);
    expect(apply).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(client.getMessages())).toContain(
      "Your draft is unchanged.",
    );

    context.mode = "edit";
    await client.sendMessage("Show me a validation warning");
    expect(JSON.stringify(client.getMessages())).toContain(
      "[Confirm the opening hours]",
    );
    const warning = client.getInterrupts()[0];
    if (warning?.kind !== "tool-approval")
      throw new Error("Missing warning approval");
    warning.resolveInterrupt(false);
    await vi.waitFor(() =>
      expect(JSON.stringify(client.getMessages())).toContain(
        "The demo draft was left unchanged.",
      ),
    );
    expect(apply).toHaveBeenCalledTimes(1);

    await vi.waitFor(() => expect(client.getIsLoading()).toBe(false));
    await client.sendMessage("Show me a code example");
    expect(client.getInterrupts()).toHaveLength(0);
    expect(JSON.stringify(client.getMessages())).toContain("```json");
    expect(apply).toHaveBeenCalledTimes(1);

    vi.stubEnv("NODE_ENV", "production");
    await expect(
      streamDemo(
        {
          threadId: "production-test",
          runId: "production-run",
          messages: [],
        } as Parameters<typeof streamDemo>[0],
        context,
        new AbortController().signal,
      ),
    ).rejects.toThrow("only in local development");
  } finally {
    client.stop();
    vi.unstubAllEnvs();
  }
});
