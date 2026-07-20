import { Router, type Request, type Response } from "express";
import { randomUUID } from "node:crypto";
import { buildSystemPrompt } from "../ai/build-system-prompt.js";
import { getContentSystemPrompt } from "../ai/content-prompt.js";
import { chat, isAvailable } from "../ai/client.js";
import {
  generateRecipeResponse,
  type RecipeResponse,
} from "../ai/recipe-generation.js";
import { createJobStore, toStatusResponse } from "../ai/job-store.js";
import { extractFirstJsonBlock } from "../ai/recipe-extractor.js";
import { presignHandler, processHandler, statusHandler } from "./ai-upload.js";
import { badRequest, notFound } from "../lib/http-error.js";

export const aiRouter = Router();

// The builder is stateless: every AI action is a single, self-contained turn.
// There is no server-side conversation — the editor owns the live draft and
// sends the current recipe JSON along with each edit, so there is no in-memory
// session to lose on restart (closes #332).

// Compose the single user turn from the parts the editor sends. An Edit Form
// tweak arrives as `recipeJson` (the serialized current draft) + `message`
// (the instruction); a plain ask arrives as just `message`. The recipe is
// fenced so the model treats it as the form to modify rather than as prose.
// PDF uploads have their own pipeline (see ai-upload.ts); they never reach
// here.
function buildUserText(message?: string, recipeJson?: string): string {
  if (recipeJson) {
    const instruction =
      message?.trim() ||
      "Update the recipe as described and return the complete, modified recipe.";
    return `Here is the current form recipe JSON:\n\n\`\`\`json\n${recipeJson}\n\`\`\`\n\n${instruction}`;
  }
  return (
    message?.trim() ||
    "Convert this uploaded form into a complete, valid recipe."
  );
}

// GET /builder/ai/status
aiRouter.get("/status", async (_req, res) => {
  const available = await isAvailable();
  res.json({
    available,
    message: available ? "AI service is ready" : "AI service not configured",
  });
});

// Text-only AI edits run as an async job so no single SSR request approaches
// the Amplify WEB_COMPUTE ~28s timeout (#1129): /edit/start returns a jobId
// immediately and kicks off Bedrock fire-and-forget; the client polls
// /edit/status/:jobId until the generation finishes.
//
// State lives in an in-memory job-store keyed by jobId (see ai/job-store.ts for
// the shared single-ECS-task / ephemeral-state rationale and the sweep that
// caps memory). Unlike the PDF path (which can re-derive from Textract's 7-day
// result), an edit job is pure Bedrock with no external anchor — if the task
// restarts mid-edit the in-flight job is lost and the next poll 404s, which the
// client surfaces as "that was interrupted — try again".
const editStore = createJobStore<RecipeResponse>();

async function runEditBedrock(
  jobId: string,
  message?: string,
  recipeJson?: string,
): Promise<void> {
  try {
    const systemPrompt = await buildSystemPrompt();
    const userText = buildUserText(message, recipeJson);
    const result = await generateRecipeResponse(systemPrompt, [
      { role: "user", content: userText },
    ]);
    editStore.set(jobId, {
      kind: "done",
      result,
      finishedAt: Date.now(),
    });
  } catch (err) {
    editStore.set(jobId, {
      kind: "failed",
      reason: err instanceof Error ? err.message : "Edit generation failed",
      finishedAt: Date.now(),
    });
  }
}

// POST /builder/ai/edit/start — body { message?, recipeJson? } → { jobId }.
// At least one of message/recipeJson must be present.
//   - Edit Form: { message, recipeJson } → modified recipe
//   - Plain ask: { message }             → conversational reply, no recipe
//
// PDF uploads use the separate /builder/ai/upload/* family (see ai-upload.ts).
export async function startEditHandler(
  req: Request,
  res: Response,
): Promise<void> {
  if (!(await isAvailable())) {
    res.status(503).json({ error: "AI service not configured" });
    return;
  }

  const { message, recipeJson } = req.body ?? {};
  if (!message && !recipeJson) {
    throw badRequest("Provide at least one of message, recipeJson");
  }

  const jobId = randomUUID();
  editStore.set(jobId, { kind: "running", startedAt: Date.now() });
  // Fire-and-forget. runEditBedrock catches its own errors into the map.
  void runEditBedrock(jobId, message, recipeJson);
  res.json({ jobId });
}

// GET /builder/ai/edit/status/:jobId — { status: "generating" | "done" |
// "failed", … }. An unknown id (expired/swept, or lost to a restart) → 404.
export function statusEditHandler(req: Request, res: Response): void {
  const jobId = req.params.jobId;
  const state = typeof jobId === "string" ? editStore.get(jobId) : undefined;

  if (!state) {
    throw notFound("This edit session expired — please try again.");
  }
  res.json(toStatusResponse(state));
}

aiRouter.post("/edit/start", startEditHandler);
aiRouter.get("/edit/status/:jobId", statusEditHandler);

// Extracts the page-fields object from a content reply: the first fenced JSON
// block that parses to a plain object. Unlike recipes there are no required
// keys — the model proposes only the fields it changed.
export function extractContentPage(
  text: string,
): Record<string, unknown> | null {
  return extractFirstJsonBlock<Record<string, unknown>>(
    text,
    (parsed) => parsed && typeof parsed === "object" && !Array.isArray(parsed),
  );
}

// POST /builder/ai/content — synchronous AI generation for the content CMS
// (landing-site service/start pages). Mirrors /edit but with the content
// system prompt and a page-fields contract instead of a recipe.
//
// Body: { message, pageJson? }.
//   - Generate/rewrite: { message, pageJson } → proposed page fields
//   - From scratch:     { message }           → proposed page fields
//
// The editor applies the returned fields to its draft; nothing is deployed.
export async function contentHandler(
  req: Request,
  res: Response,
): Promise<void> {
  if (!(await isAvailable())) {
    res.status(503).json({ error: "AI service not configured" });
    return;
  }

  const { message, pageJson } = req.body ?? {};
  if (!message || typeof message !== "string" || !message.trim()) {
    throw badRequest("Provide a message");
  }

  const userText = pageJson
    ? `Here is the current page as JSON:\n\n\`\`\`json\n${pageJson}\n\`\`\`\n\n${message.trim()}`
    : message.trim();

  const reply = await chat(getContentSystemPrompt(), [
    { role: "user", content: userText },
  ]);
  const page = extractContentPage(reply);

  res.json({ page, reply });
}
aiRouter.post("/content", contentHandler);

aiRouter.post("/upload/presign", presignHandler);
aiRouter.post("/upload/process", processHandler);
aiRouter.get("/upload/status/:jobId", statusHandler);
