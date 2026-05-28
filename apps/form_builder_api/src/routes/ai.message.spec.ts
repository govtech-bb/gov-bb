import type { Request, Response } from "express";

jest.mock("@govtech-bb/database", () => ({
  CustomComponent: class CustomComponent {},
  FormDefinitionEntity: class FormDefinitionEntity {},
}));
jest.mock("@govtech-bb/form-builder", () => ({
  findRecipeIdCollisionsFromRecipe: jest.fn(),
}));
jest.mock("../db.js", () => ({ getDataSource: jest.fn() }));
jest.mock("../catalog.js", () => ({ getFullCatalog: jest.fn() }));
jest.mock("../ai/system-prompt.js", () => ({ getSystemPrompt: () => "" }));
jest.mock("../ai/client.js", () => ({
  chat: jest.fn(),
  ensureInitialised: jest.fn(),
  isAvailable: jest.fn().mockResolvedValue(true),
}));
jest.mock("../ai/recipe-extractor.js", () => ({ extractRecipe: jest.fn() }));
jest.mock("../ai/sql-builder.js", () => ({ buildSql: jest.fn() }));
jest.mock("../ai/s3.js", () => ({
  presignPutObject: jest.fn(),
  fetchObjectAsBase64: jest.fn(),
}));

import { chat } from "../ai/client.js";
import { fetchObjectAsBase64 } from "../ai/s3.js";
import { __aiTestHooks, sendMessageHandler } from "./ai";

const chatMock = chat as jest.Mock;
const fetchObjectAsBase64Mock = fetchObjectAsBase64 as jest.Mock;

function mockReq(params: Record<string, string>, body: unknown): Request {
  return { params, body } as unknown as Request;
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

function seedSession(id: string) {
  const session = {
    id,
    name: "test",
    messages: [] as { role: "user" | "assistant"; content: string }[],
    recipe: null,
    systemPrompt: "system",
  };
  __aiTestHooks.putSession(session);
  return session;
}

describe("POST /builder/ai/sessions/:id/message — s3Key branch", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    __aiTestHooks.clear();
    chatMock.mockResolvedValue("assistant reply");
  });

  it("rejects an s3Key that does not belong to this session", async () => {
    seedSession("session-a");
    const res = mockRes();
    await sendMessageHandler(
      mockReq(
        { id: "session-a" },
        {
          message: "hi",
          s3Key: "ai-uploads/session-b/abc-form.pdf",
        },
      ),
      res,
    );
    expect(res.statusCode).toBe(400);
    expect(fetchObjectAsBase64Mock).not.toHaveBeenCalled();
    expect(chatMock).not.toHaveBeenCalled();
  });

  it("fetches the PDF from S3 and feeds it into chat()", async () => {
    seedSession("session-a");
    fetchObjectAsBase64Mock.mockResolvedValue("BASE64BYTES");

    const res = mockRes();
    await sendMessageHandler(
      mockReq(
        { id: "session-a" },
        {
          message: "extract this",
          s3Key: "ai-uploads/session-a/uuid-form.pdf",
        },
      ),
      res,
    );

    expect(res.statusCode).toBe(200);
    expect(fetchObjectAsBase64Mock).toHaveBeenCalledWith(
      "ai-uploads/session-a/uuid-form.pdf",
    );
    expect(chatMock).toHaveBeenCalledWith(
      "system",
      expect.arrayContaining([
        expect.objectContaining({ role: "user", content: "extract this" }),
      ]),
      ["BASE64BYTES"],
    );
    const stored = __aiTestHooks.getSession("session-a")!;
    expect(stored.pdfPages).toEqual(["BASE64BYTES"]);
  });

  it("preserves the legacy pdfBase64 path for the deploy window", async () => {
    seedSession("session-a");
    const res = mockRes();
    await sendMessageHandler(
      mockReq({ id: "session-a" }, { message: "go", pdfBase64: "INLINE" }),
      res,
    );

    expect(res.statusCode).toBe(200);
    expect(fetchObjectAsBase64Mock).not.toHaveBeenCalled();
    expect(chatMock).toHaveBeenCalledWith("system", expect.any(Array), [
      "INLINE",
    ]);
  });

  it("does not refetch when the session already has a PDF", async () => {
    const session = seedSession("session-a");
    session.pdfPages = ["already-loaded"];

    const res = mockRes();
    await sendMessageHandler(
      mockReq(
        { id: "session-a" },
        {
          message: "follow up",
          s3Key: "ai-uploads/session-a/uuid-form.pdf",
        },
      ),
      res,
    );

    expect(res.statusCode).toBe(200);
    expect(fetchObjectAsBase64Mock).not.toHaveBeenCalled();
    expect(chatMock).toHaveBeenCalledWith("system", expect.any(Array), [
      "already-loaded",
    ]);
  });
});
