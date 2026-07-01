import type { Mock } from "vitest";
import type { Request, Response } from "express";

vi.mock("@govtech-bb/database", () => ({ CustomComponent: class {} }));
vi.mock("../db.js", () => ({ getDataSource: vi.fn() }));
vi.mock("../ai/system-prompt.js", () => ({
  getSystemPrompt: () => "BASE_PROMPT",
}));
vi.mock("../ai/client.js", () => ({
  chat: vi.fn(),
  isAvailable: vi.fn().mockResolvedValue(true),
}));
vi.mock("../ai/recipe-extractor.js", () => ({ extractRecipe: vi.fn() }));
vi.mock("../ai/textract.js", () => ({
  startAnalysis: vi.fn(),
  getAnalysisResult: vi.fn(),
  blocksToText: vi.fn(),
}));
vi.mock("../storage/s3-uploads.js", () => ({ presignUpload: vi.fn() }));

import { chat, isAvailable } from "../ai/client.js";
import { extractRecipe } from "../ai/recipe-extractor.js";
import {
  startAnalysis,
  getAnalysisResult,
  blocksToText,
} from "../ai/textract.js";
import { presignUpload } from "../storage/s3-uploads.js";
import { HttpError } from "../lib/http-error";
import { presignHandler, processHandler, statusHandler } from "./ai-upload";

const chatMock = chat as Mock;
const extractRecipeMock = extractRecipe as Mock;
const startAnalysisMock = startAnalysis as Mock;
const getAnalysisResultMock = getAnalysisResult as Mock;
const blocksToTextMock = blocksToText as Mock;
const presignUploadMock = presignUpload as Mock;

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
  (isAvailable as Mock).mockResolvedValue(true);
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

  it("503s when S3_BUCKET is not set", async () => {
    delete process.env.S3_BUCKET;
    const res = mockRes();
    await presignHandler(mockReq(), res);
    expect(res.statusCode).toBe(503);
    expect(res.body).toEqual({ error: "Upload service not configured" });
  });
});

describe("processHandler", () => {
  it("throws a 400 HttpError when s3Key shape is wrong", async () => {
    const err = await processHandler(
      mockReq({ s3Key: "../../etc/passwd" }),
      mockRes(),
    ).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(HttpError);
    expect((err as HttpError).status).toBe(400);
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

  it("accepts an optional context and returns jobId", async () => {
    startAnalysisMock.mockResolvedValue({ jobId: "job-ctx-1" });
    const res = mockRes();
    await processHandler(
      mockReq({
        s3Key: "uploads/abc-12345678-1234-1234-1234-1234567890ab.pdf",
        context: "make every field optional",
      }),
      res,
    );
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ jobId: "job-ctx-1" });
  });

  it("throws a 400 HttpError when context exceeds the length cap", async () => {
    startAnalysisMock.mockResolvedValue({ jobId: "job-ctx-toolong" });
    const err = await processHandler(
      mockReq({
        s3Key: "uploads/abc-12345678-1234-1234-1234-1234567890ab.pdf",
        context: "x".repeat(2001),
      }),
      mockRes(),
    ).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(HttpError);
    expect((err as HttpError).status).toBe(400);
    expect(startAnalysisMock).not.toHaveBeenCalled();
  });

  it("404s when Textract reports InvalidS3Object (uploaded file not found)", async () => {
    startAnalysisMock.mockRejectedValue(
      Object.assign(
        new Error("InvalidS3ObjectException: object not found"),
        {},
      ),
    );
    const res = mockRes();
    await processHandler(
      mockReq({
        s3Key: "uploads/abc-12345678-1234-1234-1234-1234567890ab.pdf",
      }),
      res,
    );
    expect(res.statusCode).toBe(404);
    expect(res.body).toEqual({
      error: "The uploaded file was not found. Please try again.",
    });
  });

  it("429s when Textract reports LimitExceeded", async () => {
    startAnalysisMock.mockRejectedValue(
      new Error("LimitExceededException: quota"),
    );
    const res = mockRes();
    await processHandler(
      mockReq({
        s3Key: "uploads/abc-12345678-1234-1234-1234-1234567890ab.pdf",
      }),
      res,
    );
    expect(res.statusCode).toBe(429);
    expect(res.body).toEqual({
      error: "Too many uploads in progress — please try again in a minute.",
    });
  });
});

describe("statusHandler", () => {
  it("returns { status: 'processing' } while Textract is in progress", async () => {
    getAnalysisResultMock.mockResolvedValue({ status: "processing" });
    const res = mockRes();
    await statusHandler(mockReq({}, { jobId: "j-1" }), res);
    expect(res.body).toEqual({ status: "processing" });
  });

  it("kicks off Bedrock on first 'done' poll, returns recipe on subsequent poll", async () => {
    getAnalysisResultMock.mockResolvedValue({
      status: "done",
      blocks: [{ BlockType: "PAGE" }],
    });
    blocksToTextMock.mockReturnValue("## Page 1\n\nName: ____");

    // Make chat() take a tick so the first poll returns "generating"
    let resolveChat: (value: string) => void;
    chatMock.mockReturnValue(
      new Promise((r) => {
        resolveChat = r;
      }),
    );
    extractRecipeMock.mockReturnValue({ formId: "f", steps: [] });

    // First poll: Textract done, Bedrock kicked off, returns "generating"
    const res1 = mockRes();
    await statusHandler(mockReq({}, { jobId: "j-1" }), res1);
    expect(res1.body).toMatchObject({ status: "generating" });
    expect(chatMock).toHaveBeenCalledTimes(1);

    // Resolve Bedrock
    resolveChat!('```json\n{"formId":"f","steps":[]}\n```');
    // Let microtasks flush
    await new Promise((r) => setImmediate(r));

    // Second poll: Bedrock done, returns recipe
    const res2 = mockRes();
    await statusHandler(mockReq({}, { jobId: "j-1" }), res2);
    expect(res2.body).toMatchObject({
      status: "done",
      recipe: { formId: "f", steps: [] },
    });
    // chat() was NOT called again
    expect(chatMock).toHaveBeenCalledTimes(1);
  });

  it("returns 'generating' on a poll that arrives while Bedrock is still running", async () => {
    getAnalysisResultMock.mockResolvedValue({
      status: "done",
      blocks: [{ BlockType: "PAGE" }],
    });
    blocksToTextMock.mockReturnValue("...");
    // chat() never resolves
    chatMock.mockReturnValue(new Promise(() => {}));

    const res1 = mockRes();
    await statusHandler(mockReq({}, { jobId: "j-running" }), res1);
    expect(res1.body).toMatchObject({ status: "generating" });

    const res2 = mockRes();
    await statusHandler(mockReq({}, { jobId: "j-running" }), res2);
    expect(res2.body).toMatchObject({ status: "generating" });

    expect(chatMock).toHaveBeenCalledTimes(1); // only kicked off once
  });

  it("returns 'failed' when Bedrock conversion throws", async () => {
    getAnalysisResultMock.mockResolvedValue({
      status: "done",
      blocks: [{ BlockType: "PAGE" }],
    });
    blocksToTextMock.mockReturnValue("...");
    chatMock.mockRejectedValue(new Error("bedrock blew up"));

    // First poll kicks it off
    const res1 = mockRes();
    await statusHandler(mockReq({}, { jobId: "j-fail" }), res1);
    expect(res1.body).toMatchObject({ status: "generating" });

    // Flush microtasks so the rejection lands in the map
    await new Promise((r) => setImmediate(r));

    // Second poll observes the failure
    const res2 = mockRes();
    await statusHandler(mockReq({}, { jobId: "j-fail" }), res2);
    expect(res2.body).toMatchObject({
      status: "failed",
      reason: "bedrock blew up",
    });
  });

  it("injects stashed context into the Bedrock user prompt", async () => {
    startAnalysisMock.mockResolvedValue({ jobId: "job-inject" });
    const procRes = mockRes();
    await processHandler(
      mockReq({
        s3Key: "uploads/abc-12345678-1234-1234-1234-1234567890ab.pdf",
        context: "skip the payment page",
      }),
      procRes,
    );
    expect(procRes.statusCode).toBe(200);

    getAnalysisResultMock.mockResolvedValue({
      status: "done",
      blocks: [{ BlockType: "PAGE" }],
    });
    blocksToTextMock.mockReturnValue("...");
    chatMock.mockResolvedValue('```json\n{"formId":"f","steps":[]}\n```');
    extractRecipeMock.mockReturnValue({ formId: "f", steps: [] });

    const res = mockRes();
    await statusHandler(mockReq({}, { jobId: "job-inject" }), res);
    await new Promise((r) => setImmediate(r));

    const userMessage = chatMock.mock.calls[0][1][0].content as string;
    expect(userMessage).toContain("skip the payment page");
    expect(userMessage).toContain("Additional instructions from the user:");
  });

  it("keeps the verbatim base prompt when no context was stashed", async () => {
    getAnalysisResultMock.mockResolvedValue({
      status: "done",
      blocks: [{ BlockType: "PAGE" }],
    });
    blocksToTextMock.mockReturnValue("...");
    chatMock.mockResolvedValue('```json\n{"formId":"f","steps":[]}\n```');
    extractRecipeMock.mockReturnValue({ formId: "f", steps: [] });

    const res = mockRes();
    await statusHandler(mockReq({}, { jobId: "job-no-ctx" }), res);
    await new Promise((r) => setImmediate(r));

    const userMessage = chatMock.mock.calls[0][1][0].content as string;
    expect(userMessage).toBe(
      "Convert this uploaded form into a complete, valid recipe.",
    );
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

  it("404s when Textract reports InvalidJobId", async () => {
    getAnalysisResultMock.mockRejectedValue(
      new Error("InvalidJobIdException: bad job id"),
    );
    const res = mockRes();
    await statusHandler(mockReq({}, { jobId: "j-1" }), res);
    expect(res.statusCode).toBe(404);
    expect(res.body).toEqual({
      error: "This upload session expired. Please re-upload.",
    });
  });

  it("maps corrupted-file reasons to a friendly message", async () => {
    getAnalysisResultMock.mockResolvedValue({
      status: "failed",
      reason: "Unsupported document format",
    });
    const res = mockRes();
    await statusHandler(mockReq({}, { jobId: "j-1" }), res);
    expect(res.body).toEqual({
      status: "failed",
      reason:
        "We couldn't read this PDF. It may be corrupted or in an unsupported format.",
    });
  });

  it("maps partial-readability reasons to a friendly message", async () => {
    getAnalysisResultMock.mockResolvedValue({
      status: "failed",
      reason: "Partial success",
    });
    const res = mockRes();
    await statusHandler(mockReq({}, { jobId: "j-1" }), res);
    expect(res.body).toEqual({
      status: "failed",
      reason:
        "The PDF was only partially readable — please try a clearer scan.",
    });
  });

  it("503s on done when AI service is unavailable", async () => {
    (isAvailable as Mock).mockResolvedValueOnce(false);
    getAnalysisResultMock.mockResolvedValue({
      status: "done",
      blocks: [{ BlockType: "PAGE" }],
    });
    const res = mockRes();
    // Use a unique jobId so this test isn't seeing Bedrock state cached by an
    // earlier test in the module (the module-level bedrockStateByJobId map
    // persists across tests in the same file).
    await statusHandler(mockReq({}, { jobId: "j-503-unique" }), res);
    expect(res.statusCode).toBe(503);
  });

  it("still returns processing even when AI service is unavailable (no Bedrock needed yet)", async () => {
    (isAvailable as Mock).mockResolvedValueOnce(false);
    getAnalysisResultMock.mockResolvedValue({ status: "processing" });
    const res = mockRes();
    await statusHandler(mockReq({}, { jobId: "j-1" }), res);
    expect(res.body).toEqual({ status: "processing" });
    expect(res.statusCode).toBe(200);
  });
});
