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
import { convertHandler } from "./ai";

const chatMock = chat as jest.Mock;
const isAvailableMock = isAvailable as jest.Mock;
const extractRecipeMock = extractRecipe as jest.Mock;
const getDataSourceMock = getDataSource as jest.Mock;

function mockReq(body: unknown): Request {
  return { body } as unknown as Request;
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

describe("POST /builder/ai/convert", () => {
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
    await convertHandler(mockReq({ message: "hi" }), res);
    expect(res.statusCode).toBe(503);
    expect(chatMock).not.toHaveBeenCalled();
  });

  it("400s when no message, recipeJson, or pdfBase64 is provided", async () => {
    const res = mockRes();
    await convertHandler(mockReq({}), res);
    expect(res.statusCode).toBe(400);
    expect(chatMock).not.toHaveBeenCalled();
  });

  it("fences the recipe JSON into the user turn for an Edit Form tweak", async () => {
    const res = mockRes();
    await convertHandler(
      mockReq({
        message: "make the email field required",
        recipeJson: '{"formId":"contact","steps":[]}',
      }),
      res,
    );

    expect(res.statusCode).toBe(200);
    const [, messages] = chatMock.mock.calls[0];
    expect(messages).toHaveLength(1);
    expect(messages[0].role).toBe("user");
    expect(messages[0].content).toContain('{"formId":"contact","steps":[]}');
    expect(messages[0].content).toContain("make the email field required");
    // No PDF on an Edit Form turn.
    expect(chatMock.mock.calls[0][2]).toBeUndefined();
    expect(res.body).toEqual({
      recipe: { formId: "f", steps: [] },
      reply: "assistant reply",
      unresolvableRefs: [],
    });
  });

  it("passes pdfBase64 through as a PDF page for an Upload", async () => {
    const res = mockRes();
    await convertHandler(mockReq({ pdfBase64: "BASE64BYTES" }), res);

    expect(res.statusCode).toBe(200);
    expect(chatMock.mock.calls[0][2]).toEqual(["BASE64BYTES"]);
  });

  it("appends live custom components to the system prompt", async () => {
    mockDataSource([
      {
        namespace: "gov",
        type: "nis-number",
        definition: { htmlType: "text", label: "NIS Number" },
      },
    ]);
    const res = mockRes();
    await convertHandler(mockReq({ message: "build a form" }), res);

    const [systemPrompt] = chatMock.mock.calls[0];
    expect(systemPrompt).toContain("BASE_PROMPT");
    expect(systemPrompt).toContain("components/gov/nis-number");
    expect(systemPrompt).toContain("Live Custom Components");
  });

  it("returns recipe: null with the reply when the model has no recipe", async () => {
    extractRecipeMock.mockReturnValue(null);
    chatMock.mockResolvedValue("I can't help with that.");
    const res = mockRes();
    await convertHandler(mockReq({ message: "hello", recipeJson: "{}" }), res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({
      recipe: null,
      reply: "I can't help with that.",
      unresolvableRefs: [],
    });
  });

  it("reports unresolvableRefs when the emitted recipe references an unknown ref", async () => {
    extractRecipeMock.mockReturnValue({
      formId: "f",
      steps: [
        {
          stepId: "step-1",
          title: "Step 1",
          elements: [
            { ref: "components/generic/text" }, // pre-migration slash ref
            { ref: "components/text" }, // resolves against builtin catalog
          ],
        },
      ],
    });
    const res = mockRes();
    await convertHandler(mockReq({ message: "build a form" }), res);

    expect(res.statusCode).toBe(200);
    const body = res.body as { unresolvableRefs: unknown };
    expect(body.unresolvableRefs).toEqual([
      {
        ref: "components/generic/text",
        path: "steps[step-1].elements[0].ref",
      },
    ]);
  });

  it("degrades to unresolvableRefs: [] (preserving the reply) when a step is malformed", async () => {
    // A hallucinated recipe whose step has no `elements` would make the ref
    // pre-check throw; it must not sink the response.
    extractRecipeMock.mockReturnValue({
      formId: "f",
      steps: [{ stepId: "step-1", title: "Step 1" }],
    });
    const res = mockRes();
    await convertHandler(mockReq({ message: "build a form" }), res);

    expect(res.statusCode).toBe(200);
    const body = res.body as { reply: string; unresolvableRefs: unknown };
    expect(body.reply).toBe("assistant reply");
    expect(body.unresolvableRefs).toEqual([]);
  });

  it("500s when chat() throws", async () => {
    chatMock.mockRejectedValue(new Error("bedrock exploded"));
    const res = mockRes();
    await convertHandler(mockReq({ message: "hi" }), res);
    expect(res.statusCode).toBe(500);
    expect(res.body).toEqual({ error: "bedrock exploded" });
  });
});
