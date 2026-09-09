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
