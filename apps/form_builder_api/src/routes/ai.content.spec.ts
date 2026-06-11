jest.mock("@govtech-bb/database", () => ({
  CustomComponent: class CustomComponent {},
}));
jest.mock("../db.js", () => ({ getDataSource: jest.fn() }));
jest.mock("../ai/content-prompt.js", () => ({
  getContentSystemPrompt: () => "CONTENT_PROMPT",
}));
jest.mock("../ai/client.js", () => ({
  chat: jest.fn(),
  isAvailable: jest.fn().mockResolvedValue(true),
}));

import { chat, isAvailable } from "../ai/client.js";
import { mockReq, mockRes } from "../test-helpers/express-mocks";
import { contentHandler, extractContentPage } from "./ai";

const chatMock = chat as jest.Mock;
const isAvailableMock = isAvailable as jest.Mock;

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
    jest.clearAllMocks();
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

  it("400s when no message is provided", async () => {
    const res = mockRes();
    await contentHandler(mockReq({ pageJson: "{}" }), res);
    expect(res.statusCode).toBe(400);
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

  it("500s when chat() throws", async () => {
    chatMock.mockRejectedValue(new Error("bedrock exploded"));
    const res = mockRes();
    await contentHandler(mockReq({ message: "hi" }), res);
    expect(res.statusCode).toBe(500);
    expect(res.body).toEqual({ error: "bedrock exploded" });
  });
});
