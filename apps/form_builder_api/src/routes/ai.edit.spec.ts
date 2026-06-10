import type { Request, Response } from "express";

jest.mock("@govtech-bb/database", () => ({
  CustomComponent: class CustomComponent {},
}));
jest.mock("../db.js", () => ({ getDataSource: jest.fn() }));
jest.mock("../ai/system-prompt.js", () => ({
  getSystemPrompt: () => "BASE_PROMPT",
}));
jest.mock("../ai/client.js", () => ({
  chat: jest.fn(),
  isAvailable: jest.fn().mockResolvedValue(true),
}));
jest.mock("../ai/recipe-extractor.js", () => ({ extractRecipe: jest.fn() }));

import { chat, isAvailable } from "../ai/client.js";
import { extractRecipe } from "../ai/recipe-extractor.js";
import { getDataSource } from "../db.js";
import { startEditHandler, statusEditHandler } from "./ai";

const chatMock = chat as jest.Mock;
const isAvailableMock = isAvailable as jest.Mock;
const extractRecipeMock = extractRecipe as jest.Mock;
const getDataSourceMock = getDataSource as jest.Mock;

function mockReq(
  body: unknown = {},
  params: Record<string, string> = {},
): Request {
  return { body, params } as unknown as Request;
}

interface CapturingResponse extends Response {
  statusCode: number;
  body: unknown;
}

function mockRes(): CapturingResponse {
  const res = { statusCode: 200, body: undefined } as CapturingResponse;
  res.status = jest.fn((code: number) => {
    res.statusCode = code;
    return res;
  }) as unknown as Response["status"];
  res.json = jest.fn((payload: unknown) => {
    res.body = payload;
    return res;
  }) as unknown as Response["json"];
  return res;
}

// getDataSource().getRepository(CustomComponent).find() → custom components.
function mockDataSource(customs: unknown[]) {
  getDataSourceMock.mockResolvedValue({
    getRepository: () => ({ find: jest.fn().mockResolvedValue(customs) }),
  });
}

// Flush the fire-and-forget runEditBedrock promise (chat → extractRecipe →
// catalog) so the next poll observes a terminal state.
const flush = () => new Promise((r) => setImmediate(r));

// Start an edit and return its jobId. runEditBedrock is fire-and-forget and
// awaits buildSystemPrompt before reaching chat, so flush the microtask chain
// (all mocks resolve immediately) before the caller inspects chat/state.
async function startEdit(body: unknown): Promise<string> {
  const res = mockRes();
  await startEditHandler(mockReq(body), res);
  const jobId = (res.body as { jobId: string }).jobId;
  await flush();
  return jobId;
}

describe("POST /builder/ai/edit/start", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    isAvailableMock.mockResolvedValue(true);
    chatMock.mockResolvedValue("assistant reply");
    extractRecipeMock.mockReturnValue({ formId: "f", steps: [] });
    mockDataSource([]);
  });

  it("503s when the AI service is not configured", async () => {
    isAvailableMock.mockResolvedValue(false);
    const res = mockRes();
    await startEditHandler(mockReq({ message: "hi" }), res);
    expect(res.statusCode).toBe(503);
    expect(chatMock).not.toHaveBeenCalled();
  });

  it("400s when no message or recipeJson is provided", async () => {
    const res = mockRes();
    await startEditHandler(mockReq({}), res);
    expect(res.statusCode).toBe(400);
    expect(chatMock).not.toHaveBeenCalled();
  });

  it("returns a jobId and kicks off generation", async () => {
    const res = mockRes();
    await startEditHandler(mockReq({ message: "hi" }), res);
    expect(res.statusCode).toBe(200);
    const body = res.body as { jobId: string };
    expect(typeof body.jobId).toBe("string");
    expect(body.jobId.length).toBeGreaterThan(0);
    await flush();
    expect(chatMock).toHaveBeenCalledTimes(1);
  });

  it("fences the recipe JSON into the user turn for an Edit Form tweak", async () => {
    await startEdit({
      message: "make the email field required",
      recipeJson: '{"formId":"contact","steps":[]}',
    });
    const [, messages] = chatMock.mock.calls[0];
    expect(messages).toHaveLength(1);
    expect(messages[0].role).toBe("user");
    expect(messages[0].content).toContain('{"formId":"contact","steps":[]}');
    expect(messages[0].content).toContain("make the email field required");
  });

  it("appends live custom components to the system prompt", async () => {
    mockDataSource([
      {
        namespace: "gov",
        type: "nis-number",
        definition: { htmlType: "text", label: "NIS Number" },
      },
    ]);
    await startEdit({ message: "build a form" });
    const [systemPrompt] = chatMock.mock.calls[0];
    expect(systemPrompt).toContain("BASE_PROMPT");
    expect(systemPrompt).toContain("components/gov/nis-number");
    expect(systemPrompt).toContain("Live Custom Components");
  });
});

describe("GET /builder/ai/edit/status/:jobId", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    isAvailableMock.mockResolvedValue(true);
    chatMock.mockResolvedValue("assistant reply");
    extractRecipeMock.mockReturnValue({ formId: "f", steps: [] });
    mockDataSource([]);
  });

  it("404s with an expired-session message for an unknown jobId", async () => {
    const res = mockRes();
    await statusEditHandler(mockReq({}, { jobId: "does-not-exist" }), res);
    expect(res.statusCode).toBe(404);
    expect(res.body).toEqual({
      error: "This edit session expired — please try again.",
    });
  });

  it("returns { status: 'generating' } while Bedrock is still running", async () => {
    chatMock.mockReturnValue(new Promise(() => {})); // never resolves
    const jobId = await startEdit({ message: "hi" });
    const res = mockRes();
    await statusEditHandler(mockReq({}, { jobId }), res);
    expect(res.body).toEqual({ status: "generating" });
  });

  it("returns { status: 'done' } with the recipe once generation finishes", async () => {
    const jobId = await startEdit({ message: "hi", recipeJson: "{}" });
    await flush();
    const res = mockRes();
    await statusEditHandler(mockReq({}, { jobId }), res);
    expect(res.body).toEqual({
      status: "done",
      recipe: { formId: "f", steps: [] },
      reply: "assistant reply",
      unresolvableRefs: [],
    });
  });

  it("returns recipe: null when the model replies conversationally", async () => {
    extractRecipeMock.mockReturnValue(null);
    chatMock.mockResolvedValue("I can't help with that.");
    const jobId = await startEdit({ message: "hello", recipeJson: "{}" });
    await flush();
    const res = mockRes();
    await statusEditHandler(mockReq({}, { jobId }), res);
    expect(res.body).toEqual({
      status: "done",
      recipe: null,
      reply: "I can't help with that.",
      unresolvableRefs: [],
    });
  });

  it("returns { status: 'failed' } with the reason when generation throws", async () => {
    chatMock.mockRejectedValue(new Error("bedrock exploded"));
    const jobId = await startEdit({ message: "hi" });
    await flush();
    const res = mockRes();
    await statusEditHandler(mockReq({}, { jobId }), res);
    expect(res.body).toEqual({ status: "failed", reason: "bedrock exploded" });
  });
});
