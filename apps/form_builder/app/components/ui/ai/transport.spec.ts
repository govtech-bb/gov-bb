import { attachmentPart } from "./attachment-data";
import { readDocument, aiRequest, streamChat } from "./transport";
import { createAiAccess } from "../../../server/ai-builder/access";

vi.mock("../../../server/ai-builder/access", () => ({
  createAiAccess: vi.fn(),
}));

beforeEach(() => {
  vi.useFakeTimers();
  vi.mocked(createAiAccess).mockResolvedValue({
    token: "short-lived",
    url: "http://localhost/builder/ai",
  });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.resetAllMocks();
});

it("stops polling and retries the same document reference after transient failures", async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(Response.json({ status: "processing" }))
    .mockRejectedValueOnce(new TypeError("fetch failed"))
    .mockRejectedValueOnce(new TypeError("fetch failed"))
    .mockResolvedValueOnce(Response.json({ status: "done" }));
  vi.stubGlobal("fetch", fetcher);
  const document = {
    name: "form.pdf",
    reference: "existing-job",
    status: "reading" as const,
  };
  const update = vi.fn();
  const controller = new AbortController();
  const stopped = readDocument(document, controller.signal, update);
  const rejection = expect(stopped).rejects.toThrow("Stopped");
  await vi.advanceTimersByTimeAsync(0);
  controller.abort();
  await rejection;
  const retried = readDocument(document, new AbortController().signal, update);
  await vi.runAllTimersAsync();
  await retried;
  expect(update).toHaveBeenCalledWith({
    ...document,
    status: "ready",
    error: undefined,
  });
  expect(fetcher).toHaveBeenCalledTimes(4);
  expect(createAiAccess).toHaveBeenCalledTimes(4);
  for (const [url, options] of fetcher.mock.calls) {
    expect(url).toBe("http://localhost/builder/ai/documents/status");
    expect(JSON.parse(options.body)).toEqual({ reference: "existing-job" });
  }
});

it("offers a useful recovery message when the access service is unreachable", async () => {
  vi.mocked(createAiAccess).mockRejectedValueOnce(
    new TypeError("fetch failed"),
  );
  await expect(
    aiRequest("/chat", {}, new AbortController().signal),
  ).rejects.toThrow("The AI service could not be reached. Retry in a moment.");
});

it.each([
  [
    "the access service is unreachable",
    () =>
      vi
        .mocked(createAiAccess)
        .mockRejectedValueOnce(new TypeError("access failed")),
    { message: "access failed" },
  ],
  [
    "the AI API is blocked or unreachable",
    () =>
      vi.stubGlobal(
        "fetch",
        vi.fn().mockRejectedValue(new TypeError("Failed to fetch")),
      ),
    { message: "Failed to fetch" },
  ],
  [
    "the AI API rejects the request",
    () =>
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(new Response("nope", { status: 502 })),
      ),
    { status: 502 },
  ],
])("keeps and logs the underlying cause when %s", async (_, arrange, cause) => {
  arrange();
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  const error = await aiRequest(
    "/chat",
    {},
    new AbortController().signal,
  ).catch((error: unknown) => error);
  expect(error).toMatchObject({
    message: "The AI service could not be reached. Retry in a moment.",
    cause: expect.objectContaining(cause),
  });
  expect(log).toHaveBeenCalledWith(expect.any(String), (error as Error).cause);
});

it("sends document names and OCR references, never private attachment URLs, to the chat endpoint", async () => {
  const fetcher = vi.fn().mockResolvedValue(new Response());
  vi.stubGlobal("fetch", fetcher);
  await streamChat(
    {
      messages: [
        {
          id: "m",
          role: "user",
          metadata: {
            builderAttachments: [
              { id: "f", name: "form.pdf", type: "application/pdf" },
            ],
          },
          parts: [
            { type: "text", content: "Read this" },
            attachmentPart(
              { id: "f", name: "form.pdf", type: "application/pdf" },
              "https://private.example/form.pdf",
            ),
          ],
        },
      ],
      threadId: "t",
      runId: "r",
    },
    {
      kind: "form",
      documentId: "d",
      revision: "r",
      mode: "edit",
      services: [],
      document: {},
      attachments: [{ name: "form.pdf", reference: "owned-job" }],
    },
    new AbortController().signal,
  );
  const payload = JSON.parse(fetcher.mock.calls[0][1].body);
  expect(JSON.stringify(payload.messages)).not.toContain(
    "https://private.example",
  );
  expect(JSON.stringify(payload.messages)).toContain("form.pdf");
  expect(payload.forwardedProps.attachments[0].reference).toBe("owned-job");
});

const chatContext = {
  kind: "form" as const,
  documentId: "d",
  revision: "r",
  mode: "edit" as const,
  services: [],
  document: {},
  attachments: [],
};

it("leaves unfinished tool calls out of the request but keeps finished results", async () => {
  const fetcher = vi.fn().mockResolvedValue(new Response());
  vi.stubGlobal("fetch", fetcher);
  const call = (id: string, state: string, extra = {}) => ({
    type: "tool-call",
    id,
    name: "read_form",
    arguments: "{}",
    state,
    ...extra,
  });
  await streamChat(
    {
      messages: [
        { id: "u1", role: "user", parts: [{ type: "text", content: "One" }] },
        {
          id: "a1",
          role: "assistant",
          parts: [
            call("answered", "input-complete", { output: { ok: true } }),
            call("resulted", "input-complete"),
            {
              type: "tool-result",
              toolCallId: "resulted",
              content: "{}",
              state: "complete",
            },
            call("approved", "approval-responded", {
              approval: { id: "a", needsApproval: true, approved: true },
            }),
            call("starting", "awaiting-input"),
            call("partial", "input-streaming", { arguments: '{"ref":"x' }),
            call("unanswered", "input-complete"),
          ],
        },
        {
          id: "a2",
          role: "assistant",
          parts: [call("cut-off", "input-streaming")],
        },
        { id: "u2", role: "user", parts: [{ type: "text", content: "Two" }] },
      ] as never,
      threadId: "t",
      runId: "r",
    },
    chatContext,
    new AbortController().signal,
  );
  const { messages } = JSON.parse(fetcher.mock.calls[0][1].body);
  const sent = JSON.stringify(messages);
  for (const id of ["answered", "resulted", "approved"])
    expect(sent).toContain(`"id":"${id}"`);
  for (const id of ["starting", "partial", "unanswered", "cut-off"])
    expect(sent).not.toContain(`"${id}"`);
  expect(messages.map((message: { id: string }) => message.id)).not.toContain(
    "a2",
  );
});

it("sends a new prompt after a run that timed out during an edit without the old call", async () => {
  vi.useRealTimers();
  const { ChatClient } = await import("@tanstack/ai-client");
  const sse = (...events: object[]) =>
    new Response(
      events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join(""),
      { headers: { "Content-Type": "text/event-stream" } },
    );
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(
      sse(
        { type: "RUN_STARTED", threadId: "t", runId: "one" },
        {
          type: "TOOL_CALL_START",
          toolCallId: "old-edit",
          toolCallName: "apply_form_draft",
        },
        {
          type: "TOOL_CALL_ARGS",
          toolCallId: "old-edit",
          delta:
            '{"summary":"Rename","recipe":{"formId":"t","title":"Old","steps":[]}}',
        },
        { type: "TOOL_CALL_END", toolCallId: "old-edit" },
        { type: "RUN_ERROR", message: "This step didn't finish. Retry?" },
      ),
    )
    .mockResolvedValueOnce(
      sse(
        { type: "RUN_STARTED", threadId: "t", runId: "two" },
        { type: "RUN_FINISHED", threadId: "t", runId: "two" },
      ),
    );
  vi.stubGlobal("fetch", fetcher);
  const client = new ChatClient({
    threadId: "t",
    fetcher: (input, { signal }) => streamChat(input, chatContext, signal),
  });
  await client.sendMessage("Rename this form");
  expect(client.getError()?.message).toBe("This step didn't finish. Retry?");
  await client.sendMessage("What is a form?");
  const { messages } = JSON.parse(fetcher.mock.calls[1][1].body);
  expect(JSON.stringify(messages)).not.toContain("old-edit");
  expect(messages.at(-1)).toMatchObject({
    role: "user",
    content: "What is a form?",
  });
});
