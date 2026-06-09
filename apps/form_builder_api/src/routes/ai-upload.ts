import type { Request, Response } from "express";
import { collectUnknownRefs, type UnknownRef } from "@govtech-bb/form-builder";
import type { ServiceContractRecipe } from "@govtech-bb/form-types";

import { presignUpload } from "../storage/s3-uploads.js";
import {
  startAnalysis,
  getAnalysisResult,
  blocksToText,
} from "../ai/textract.js";
import { chat, isAvailable } from "../ai/client.js";
import { extractRecipe } from "../ai/recipe-extractor.js";
import { getFullCatalog } from "../catalog.js";
import { getSystemPrompt } from "../ai/system-prompt.js";

// Safe S3 key shape: prevents path traversal / arbitrary keys. We accept the
// canonical uploads/<uuid>.pdf produced by presignUpload, as well as a slightly
// looser alphanumeric + dash form so tests / future prefixes don't break the
// gate. The critical guard is that the key starts with `uploads/`, contains no
// `..` or extra `/` segments, and ends in `.pdf`.
const KEY_PATTERN = /^uploads\/[A-Za-z0-9-]+\.pdf$/;

// POST /builder/ai/upload/presign — returns { url, s3Key }
export async function presignHandler(
  _req: Request,
  res: Response,
): Promise<void> {
  try {
    if (!process.env.S3_BUCKET) {
      res.status(503).json({ error: "Upload service not configured" });
      return;
    }
    const { url, s3Key } = await presignUpload();
    res.json({ url, s3Key });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}

// POST /builder/ai/upload/process — body { s3Key } → { jobId }
export async function processHandler(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const { s3Key } = req.body ?? {};
    if (typeof s3Key !== "string" || !KEY_PATTERN.test(s3Key)) {
      res.status(400).json({ error: "Invalid request" });
      return;
    }
    const { jobId } = await startAnalysis(s3Key);
    res.json({ jobId });
  } catch (err: any) {
    const message: string = err?.message ?? "Unknown error";
    if (message.includes("InvalidS3Object")) {
      res
        .status(404)
        .json({ error: "The uploaded file was not found. Please try again." });
      return;
    }
    if (message.includes("LimitExceeded")) {
      res
        .status(429)
        .json({
          error: "Too many uploads in progress — please try again in a minute.",
        });
      return;
    }
    res.status(500).json({ error: message });
  }
}

// GET /builder/ai/upload/status/:jobId — polls Textract; on done, runs chat()
export async function statusHandler(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    if (!(await isAvailable())) {
      res.status(503).json({ error: "AI service not configured" });
      return;
    }
    const jobId = req.params.jobId;
    if (typeof jobId !== "string" || !jobId) {
      res.status(400).json({ error: "Missing jobId" });
      return;
    }
    const result = await getAnalysisResult(jobId);

    if (result.status === "processing") {
      res.json({ status: "processing" });
      return;
    }

    if (result.status === "failed") {
      res.json({ status: "failed", reason: mapTextractReason(result.reason) });
      return;
    }

    // done: convert blocks → text → chat → recipe
    const documentText = blocksToText(result.blocks);
    const systemPrompt = getSystemPrompt();
    const userText =
      "Convert this uploaded form into a complete, valid recipe.";

    const reply = await chat(
      systemPrompt,
      [{ role: "user", content: userText }],
      documentText,
    );
    const recipe = extractRecipe(reply);

    let unresolvableRefs: UnknownRef[] = [];
    if (recipe && Array.isArray((recipe as { steps?: unknown }).steps)) {
      try {
        const catalog = await getFullCatalog();
        unresolvableRefs = collectUnknownRefs(
          recipe as unknown as ServiceContractRecipe,
          catalog,
        );
      } catch (err) {
        console.warn("upload/status: ref pre-check skipped —", err);
      }
    }

    res.json({ status: "done", recipe, reply, unresolvableRefs });
  } catch (err: any) {
    const message: string = err?.message ?? "Unknown error";
    if (message.includes("InvalidJobId")) {
      res
        .status(404)
        .json({ error: "This upload session expired. Please re-upload." });
      return;
    }
    res.status(500).json({ error: message });
  }
}

function mapTextractReason(raw?: string): string {
  const reason = (raw ?? "").toLowerCase();
  if (reason.includes("password")) {
    return "This PDF appears to be password-protected. Please remove the password and re-upload.";
  }
  if (reason.includes("corrupt") || reason.includes("unsupported")) {
    return "We couldn't read this PDF. It may be corrupted or in an unsupported format.";
  }
  if (reason.includes("partial")) {
    return "The PDF was only partially readable — please try a clearer scan.";
  }
  return "We couldn't read this PDF — please try a different file.";
}
