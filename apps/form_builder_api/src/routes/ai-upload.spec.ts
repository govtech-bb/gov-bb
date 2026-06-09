import type { Request, Response } from "express";

jest.mock("@govtech-bb/database", () => ({ CustomComponent: class {} }));
jest.mock("../db.js", () => ({ getDataSource: jest.fn() }));
jest.mock("../ai/system-prompt.js", () => ({
  getSystemPrompt: () => "BASE_PROMPT",
}));
jest.mock("../ai/client.js", () => ({
  chat: jest.fn(),
  isAvailable: jest.fn().mockResolvedValue(true),
}));
jest.mock("../ai/recipe-extractor.js", () => ({ extractRecipe: jest.fn() }));
jest.mock("../ai/textract.js", () => ({
  startAnalysis: jest.fn(),
  getAnalysisResult: jest.fn(),
  blocksToText: jest.fn(),
}));
jest.mock("../storage/s3-uploads.js", () => ({ presignUpload: jest.fn() }));

import { chat } from "../ai/client.js";
import { extractRecipe } from "../ai/recipe-extractor.js";
import {
  startAnalysis,
  getAnalysisResult,
  blocksToText,
} from "../ai/textract.js";
import { presignUpload } from "../storage/s3-uploads.js";
import { presignHandler, processHandler, statusHandler } from "./ai-upload";

const chatMock = chat as jest.Mock;
const extractRecipeMock = extractRecipe as jest.Mock;
const startAnalysisMock = startAnalysis as jest.Mock;
const getAnalysisResultMock = getAnalysisResult as jest.Mock;
const blocksToTextMock = blocksToText as jest.Mock;
const presignUploadMock = presignUpload as jest.Mock;

const mockReq = (
  body: unknown = {},
  params: Record<string, string> = {},
): Request => ({ body, params }) as unknown as Request;

interface Captured extends Response {
  statusCode: number;
  body: unknown;
}
const mockRes = (): Captured => {
  const res = {} as Captured;
  res.statusCode = 200;
  res.status = (code: number) => {
    res.statusCode = code;
    return res;
  };
  res.json = (b: unknown) => {
    res.body = b;
    return res;
  };
  return res;
};

beforeEach(() => {
  chatMock.mockReset();
  extractRecipeMock.mockReset();
  startAnalysisMock.mockReset();
  getAnalysisResultMock.mockReset();
  blocksToTextMock.mockReset();
  presignUploadMock.mockReset();
  process.env.S3_BUCKET = "form-builder-uploads-sandbox-7922";
});

describe("presignHandler", () => {
  it("returns the url and s3Key", async () => {
    presignUploadMock.mockResolvedValue({
      url: "https://signed/x",
      s3Key: "uploads/abc.pdf",
    });
    const res = mockRes();
    await presignHandler(mockReq(), res);
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({
      url: "https://signed/x",
      s3Key: "uploads/abc.pdf",
    });
  });
});

describe("processHandler", () => {
  it("400s when s3Key shape is wrong", async () => {
    const res = mockRes();
    await processHandler(mockReq({ s3Key: "../../etc/passwd" }), res);
    expect(res.statusCode).toBe(400);
  });

  it("calls startAnalysis and returns jobId", async () => {
    startAnalysisMock.mockResolvedValue({ jobId: "job-1" });
    const res = mockRes();
    await processHandler(
      mockReq({
        s3Key: "uploads/abc-12345678-1234-1234-1234-1234567890ab.pdf",
      }),
      res,
    );
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ jobId: "job-1" });
  });
});

describe("statusHandler", () => {
  it("returns { status: 'processing' } while Textract is in progress", async () => {
    getAnalysisResultMock.mockResolvedValue({ status: "processing" });
    const res = mockRes();
    await statusHandler(mockReq({}, { jobId: "j-1" }), res);
    expect(res.body).toEqual({ status: "processing" });
  });

  it("runs chat() and returns the recipe when Textract is done", async () => {
    getAnalysisResultMock.mockResolvedValue({
      status: "done",
      blocks: [{ BlockType: "PAGE" }],
    });
    blocksToTextMock.mockReturnValue("## Page 1\n\nName: ____");
    chatMock.mockResolvedValue('```json\n{"formId":"f","steps":[]}\n```');
    extractRecipeMock.mockReturnValue({ formId: "f", steps: [] });

    const res = mockRes();
    await statusHandler(mockReq({}, { jobId: "j-1" }), res);

    expect(chatMock).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(Array),
      "## Page 1\n\nName: ____",
    );
    expect(res.body).toMatchObject({
      status: "done",
      recipe: { formId: "f", steps: [] },
    });
  });

  it("maps password-protected reasons to a friendly message", async () => {
    getAnalysisResultMock.mockResolvedValue({
      status: "failed",
      reason: "Document is password protected",
    });
    const res = mockRes();
    await statusHandler(mockReq({}, { jobId: "j-1" }), res);
    expect(res.body).toEqual({
      status: "failed",
      reason:
        "This PDF appears to be password-protected. Please remove the password and re-upload.",
    });
  });

  it("falls back to a generic message for unknown Textract failure reasons", async () => {
    getAnalysisResultMock.mockResolvedValue({
      status: "failed",
      reason: "something obscure",
    });
    const res = mockRes();
    await statusHandler(mockReq({}, { jobId: "j-1" }), res);
    expect((res.body as { reason: string }).reason).toBe(
      "We couldn't read this PDF — please try a different file.",
    );
  });
});
