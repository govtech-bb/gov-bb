import type { Mock } from "vitest";
vi.mock("@govtech-bb/database", () => ({
  CustomComponent: class CustomComponent {},
}));
vi.mock("../db.js", () => ({ getDataSource: vi.fn() }));
vi.mock("../ai/content-prompt.js", () => ({
  getContentSystemPrompt: () => "CONTENT_PROMPT",
}));
vi.mock("../ai/client.js", () => ({
  chat: vi.fn(),
  isAvailable: vi.fn().mockResolvedValue(true),
}));

import { chat, isAvailable } from "../ai/client.js";
import { HttpError } from "../lib/http-error";
import { mockReq, mockRes } from "../test-helpers/express-mocks";
import { contentHandler, extractContentPage } from "./ai";

const chatMock = chat as Mock;
const isAvailableMock = isAvailable as Mock;

describe("extractContentPage", () => {
  it("parses the first fenced JSON object", () => {
    const page = extractContentPage(
      'Here you go:\n```json\n{"title":"Get a permit","body":"Hello"}\n```',
    );
    expect(page).toEqual({ title: "Get a permit", body: "Hello" });
  });

  it("returns null for arrays, non-JSON blocks, and replies with no block", () => {
    expect(extractContentPage("```json\n[1,2]\n```")).toBeNull();
    expect(extractContentPage("```json\nnot json\n```")).toBeNull();
    expect(extractContentPage("plain prose, no code block")).toBeNull();
  });
});

describe("POST /builder/ai/content", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isAvailableMock.mockResolvedValue(true);
    chatMock.mockResolvedValue('reply\n```json\n{"title":"T"}\n```');
  });

  it("503s when the AI service is not configured", async () => {
    isAvailableMock.mockResolvedValue(false);
    const res = mockRes();
    await contentHandler(mockReq({ message: "hi" }), res);
    expect(res.statusCode).toBe(503);
    expect(chatMock).not.toHaveBeenCalled();
  });

  it("throws a 400 HttpError when no message is provided", async () => {
    const err = await contentHandler(
      mockReq({ pageJson: "{}" }),
      mockRes(),
    ).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(HttpError);
    expect((err as HttpError).status).toBe(400);
    expect(chatMock).not.toHaveBeenCalled();
  });

  it("uses the content system prompt and fences pageJson into the user turn", async () => {
    const res = mockRes();
    await contentHandler(
      mockReq({
        message: "rewrite the body for clarity",
        pageJson: '{"title":"Old title"}',
      }),
      res,
    );

    expect(res.statusCode).toBe(200);
    const [systemPrompt, messages] = chatMock.mock.calls[0];
    expect(systemPrompt).toBe("CONTENT_PROMPT");
    expect(messages).toHaveLength(1);
    expect(messages[0].content).toContain('{"title":"Old title"}');
    expect(messages[0].content).toContain("rewrite the body for clarity");
    expect(res.body).toEqual({
      page: { title: "T" },
      reply: 'reply\n```json\n{"title":"T"}\n```',
    });
  });

  it("returns page: null with the reply when the model emits no page", async () => {
    chatMock.mockResolvedValue("I need more detail to draft that page.");
    const res = mockRes();
    await contentHandler(mockReq({ message: "make a page" }), res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({
      page: null,
      reply: "I need more detail to draft that page.",
    });
  });

  it("propagates a chat() error (the central handler maps it to 500)", async () => {
    chatMock.mockRejectedValue(new Error("bedrock exploded"));
    await expect(
      contentHandler(mockReq({ message: "hi" }), mockRes()),
    ).rejects.toThrow("bedrock exploded");
  });
});
