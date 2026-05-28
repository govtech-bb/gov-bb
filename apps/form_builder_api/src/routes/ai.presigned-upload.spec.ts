import type { Request, Response } from "express";

// The ai router pulls in DB entities, the form-builder package, and the
// Bedrock client at import time. None of that is exercised by the
// presigned-upload route, so stub them at the module level to keep the
// spec hermetic.
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

import { presignPutObject } from "../ai/s3.js";
import { __aiTestHooks, presignedUploadHandler } from "./ai";

const presignPutObjectMock = presignPutObject as jest.Mock;

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

function seedSession(id: string): void {
  __aiTestHooks.putSession({
    id,
    name: "test",
    messages: [],
    recipe: null,
    systemPrompt: "",
  });
}

describe("POST /builder/ai/presigned-upload", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    __aiTestHooks.clear();
    presignPutObjectMock.mockResolvedValue("https://s3.example/put?sig=ok");
  });

  it("returns 404 when sessionId is unknown", async () => {
    const res = mockRes();
    await presignedUploadHandler(
      mockReq({
        sessionId: "missing",
        filename: "form.pdf",
        contentType: "application/pdf",
        size: 1024,
      }),
      res,
    );
    expect(res.statusCode).toBe(404);
    expect(presignPutObjectMock).not.toHaveBeenCalled();
  });

  it("returns 400 when filename is missing", async () => {
    seedSession("s1");
    const res = mockRes();
    await presignedUploadHandler(
      mockReq({
        sessionId: "s1",
        contentType: "application/pdf",
        size: 1024,
      }),
      res,
    );
    expect(res.statusCode).toBe(400);
  });

  it("rejects unsupported content types", async () => {
    seedSession("s1");
    const res = mockRes();
    await presignedUploadHandler(
      mockReq({
        sessionId: "s1",
        filename: "form.exe",
        contentType: "application/x-msdownload",
        size: 1024,
      }),
      res,
    );
    expect(res.statusCode).toBe(400);
  });

  it("rejects sizes over the 32MB ceiling", async () => {
    seedSession("s1");
    const res = mockRes();
    await presignedUploadHandler(
      mockReq({
        sessionId: "s1",
        filename: "form.pdf",
        contentType: "application/pdf",
        size: 33 * 1024 * 1024,
      }),
      res,
    );
    expect(res.statusCode).toBe(400);
  });

  it("rejects zero or negative sizes", async () => {
    seedSession("s1");
    const res = mockRes();
    await presignedUploadHandler(
      mockReq({
        sessionId: "s1",
        filename: "form.pdf",
        contentType: "application/pdf",
        size: 0,
      }),
      res,
    );
    expect(res.statusCode).toBe(400);
  });

  it("returns a session-scoped s3Key + signed URL on success", async () => {
    seedSession("session-abc");
    const res = mockRes();
    await presignedUploadHandler(
      mockReq({
        sessionId: "session-abc",
        filename: "My Form.pdf",
        contentType: "application/pdf",
        size: 4_000_000,
      }),
      res,
    );

    expect(res.statusCode).toBe(200);
    const body = res.body as { uploadUrl: string; s3Key: string };
    expect(body.uploadUrl).toBe("https://s3.example/put?sig=ok");
    expect(body.s3Key).toMatch(
      /^ai-uploads\/session-abc\/[0-9a-f-]{36}-my_form\.pdf$/,
    );

    expect(presignPutObjectMock).toHaveBeenCalledWith({
      key: body.s3Key,
      contentType: "application/pdf",
      contentLength: 4_000_000,
    });
  });

  it("strips path separators and unsafe characters from filenames", async () => {
    seedSession("s1");
    const res = mockRes();
    await presignedUploadHandler(
      mockReq({
        sessionId: "s1",
        filename: "  sub dir/weird;name.pdf",
        contentType: "application/pdf",
        size: 100,
      }),
      res,
    );
    expect(res.statusCode).toBe(200);
    const body = res.body as { s3Key: string };
    // Session-scoped prefix is the real safeguard; sanitizer just keeps the
    // filename portion to a safe ASCII subset so the S3 console stays readable.
    expect(body.s3Key.startsWith("ai-uploads/s1/")).toBe(true);
    const filenamePart = body.s3Key.split("/").pop()!;
    expect(filenamePart).not.toContain(";");
    expect(filenamePart).not.toContain(" ");
    expect(filenamePart).toMatch(/\.pdf$/);
  });
});
