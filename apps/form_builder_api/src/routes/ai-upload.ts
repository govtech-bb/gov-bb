import type { Request, Response } from "express";
import { collectUnknownRefs, type UnknownRef } from "@govtech-bb/form-builder";
import type { ServiceContractRecipe } from "@govtech-bb/form-types";

import { presignUpload } from "../storage/s3-uploads.js";
import {
  startAnalysis,
  getAnalysisResult,
  blocksToText,
  type Block,
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
      res.status(429).json({
        error: "Too many uploads in progress — please try again in a minute.",
      });
      return;
    }
    res.status(500).json({ error: message });
  }
}

// Per-job Bedrock execution state. Keyed by Textract JobId. We track this in
// memory because:
//   1. The form_builder_api runs a single ECS task in sandbox/staging — no
//      cross-task coordination needed.
//   2. If the task restarts mid-job, the next poll naturally re-kicks Bedrock
//      because the Textract result is still retained for 7 days.
//   3. State is meant to be ephemeral — the sweep below caps memory.
type BedrockState =
  | { kind: "running"; startedAt: number }
  | {
      kind: "done";
      result: {
        recipe: Record<string, unknown> | null;
        reply: string;
        unresolvableRefs: UnknownRef[];
      };
      finishedAt: number;
    }
  | { kind: "failed"; reason: string; finishedAt: number };

const bedrockStateByJobId = new Map<string, BedrockState>();

// Sweep entries older than 1 hour, every 5 minutes.
const ONE_HOUR_MS = 60 * 60 * 1000;
const SWEEP_INTERVAL_MS = 5 * 60 * 1000;
setInterval(() => {
  const cutoff = Date.now() - ONE_HOUR_MS;
  for (const [k, v] of bedrockStateByJobId) {
    const ts = "startedAt" in v ? v.startedAt : v.finishedAt;
    if (ts < cutoff) bedrockStateByJobId.delete(k);
  }
}, SWEEP_INTERVAL_MS).unref(); // unref so the interval doesn't keep the process alive

async function runBedrock(jobId: string, blocks: Block[]): Promise<void> {
  try {
    const documentText = blocksToText(blocks);
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

    bedrockStateByJobId.set(jobId, {
      kind: "done",
      result: { recipe, reply, unresolvableRefs },
      finishedAt: Date.now(),
    });
  } catch (err) {
    bedrockStateByJobId.set(jobId, {
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
    let bedrock = bedrockStateByJobId.get(jobId);

    if (!bedrock) {
      // Need to kick off Bedrock. First make sure the AI client is configured.
      if (!(await isAvailable())) {
        res.status(503).json({ error: "AI service not configured" });
        return;
      }
      // Re-check in case a concurrent poll already kicked off Bedrock during
      // the await above (single-threaded event loop yields on await).
      bedrock = bedrockStateByJobId.get(jobId);
      if (!bedrock) {
        bedrockStateByJobId.set(jobId, {
          kind: "running",
          startedAt: Date.now(),
        });
        // Fire-and-forget. runBedrock catches its own errors and writes them to the map.
        void runBedrock(jobId, result.blocks);
        bedrock = { kind: "running", startedAt: Date.now() };
      }
    }

    if (bedrock.kind === "running") {
      res.json({ status: "generating" });
      return;
    }
    if (bedrock.kind === "done") {
      res.json({ status: "done", ...bedrock.result });
      return;
    }
    if (bedrock.kind === "failed") {
      res.json({ status: "failed", reason: bedrock.reason });
      return;
    }
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
