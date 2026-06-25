import type { Request, Response } from "express";

import { presignUpload } from "../storage/s3-uploads.js";
import {
  startAnalysis,
  getAnalysisResult,
  blocksToText,
  type Block,
} from "../ai/textract.js";
import { isAvailable } from "../ai/client.js";
import { getSystemPrompt } from "../ai/system-prompt.js";
import {
  generateRecipeResponse,
  type RecipeResponse,
} from "../ai/recipe-generation.js";
import { createJobStore, toStatusResponse } from "../ai/job-store.js";

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

// Cap the optional steering context, matching the .max(2000) convention used
// elsewhere (forms.ts). It's user text concatenated into the Bedrock prompt, so
// the cap bounds the prompt-injection surface; downstream recipe validation +
// the Deploy gate remain the real trust boundary.
const MAX_CONTEXT_LEN = 2000;

// POST /builder/ai/upload/process — body { s3Key, context? } → { jobId }
export async function processHandler(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const { s3Key, context } = req.body ?? {};
    if (typeof s3Key !== "string" || !KEY_PATTERN.test(s3Key)) {
      res.status(400).json({ error: "Invalid request" });
      return;
    }
    const trimmedContext = typeof context === "string" ? context.trim() : "";
    if (trimmedContext.length > MAX_CONTEXT_LEN) {
      res.status(400).json({ error: "Invalid request" });
      return;
    }
    const { jobId } = await startAnalysis(s3Key);
    // Stash the context so runBedrock — which fires later, during a /status
    // poll — can read it. Same single-ECS-task / sweep assumptions as
    // uploadStore below.
    if (trimmedContext) contextByJobId.set(jobId, trimmedContext);
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
      res.status(429).json({
        error: "Too many uploads in progress — please try again in a minute.",
      });
      return;
    }
    res.status(500).json({ error: message });
  }
}

// Per-job Bedrock execution state, keyed by Textract JobId (see ai/job-store.ts
// for the shared single-ECS-task / ephemeral-state rationale and the sweep that
// caps memory). Distinct from the edit path: if the task restarts mid-job the
// next poll naturally re-kicks Bedrock because the Textract result is still
// retained for 7 days.
//
// A context entry should always be consumed by runBedrock, but the store's
// onEvict sweeps any orphan (e.g. a job that never reached the Bedrock phase)
// in lockstep with its job entry.
const uploadStore = createJobStore<RecipeResponse>({
  onEvict: (k) => contextByJobId.delete(k),
});

// Optional steering context typed alongside an upload, keyed by Textract JobId.
// Set in processHandler, consumed + deleted in runBedrock. Survives the gap
// between the /process request (where it arrives) and the later /status poll
// (where Bedrock runs). If the task restarts mid-job the entry is lost and the
// convert falls back to no-context — rare and degrades gracefully.
const contextByJobId = new Map<string, string>();

async function runBedrock(
  jobId: string,
  blocks: Block[],
  context?: string,
): Promise<void> {
  try {
    const documentText = blocksToText(blocks);
    const systemPrompt = getSystemPrompt();
    const userText = context
      ? "Convert this uploaded form into a complete, valid recipe.\n\n" +
        `Additional instructions from the user:\n${context}`
      : "Convert this uploaded form into a complete, valid recipe.";
    const result = await generateRecipeResponse(
      systemPrompt,
      [{ role: "user", content: userText }],
      documentText,
    );

    uploadStore.set(jobId, {
      kind: "done",
      result,
      finishedAt: Date.now(),
    });
  } catch (err) {
    uploadStore.set(jobId, {
      kind: "failed",
      reason: err instanceof Error ? err.message : "Bedrock conversion failed",
      finishedAt: Date.now(),
    });
  }
}

// GET /builder/ai/upload/status/:jobId — polls Textract; on done, kicks off
// Bedrock in the background and returns "generating" until Bedrock finishes.
export async function statusHandler(
  req: Request,
  res: Response,
): Promise<void> {
  try {
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

    // Textract is done. Bedrock runs in the background, keyed by jobId.
    let bedrock = uploadStore.get(jobId);

    if (!bedrock) {
      // Need to kick off Bedrock. First make sure the AI client is configured.
      if (!(await isAvailable())) {
        res.status(503).json({ error: "AI service not configured" });
        return;
      }
      // Re-check in case a concurrent poll already kicked off Bedrock during
      // the await above (single-threaded event loop yields on await).
      bedrock = uploadStore.get(jobId);
      if (!bedrock) {
        uploadStore.set(jobId, {
          kind: "running",
          startedAt: Date.now(),
        });
        // Fire-and-forget. runBedrock catches its own errors and writes them to the map.
        void runBedrock(jobId, result.blocks, contextByJobId.get(jobId));
        contextByJobId.delete(jobId);
        bedrock = { kind: "running", startedAt: Date.now() };
      }
    }

    res.json(toStatusResponse(bedrock));
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
