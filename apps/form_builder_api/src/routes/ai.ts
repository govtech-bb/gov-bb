import { Router, type Request, type Response } from "express";
import { randomUUID } from "node:crypto";
import { CustomComponent } from "@govtech-bb/database";
import { getDataSource } from "../db.js";
import { getSystemPrompt } from "../ai/system-prompt.js";
import { getContentSystemPrompt } from "../ai/content-prompt.js";
import { chat, isAvailable } from "../ai/client.js";
import {
  generateRecipeResponse,
  type RecipeResponse,
} from "../ai/recipe-generation.js";
import { presignHandler, processHandler, statusHandler } from "./ai-upload.js";

export const aiRouter = Router();

// The builder is stateless: every AI action is a single, self-contained turn.
// There is no server-side conversation — the editor owns the live draft and
// sends the current recipe JSON along with each edit, so there is no in-memory
// session to lose on restart (closes #332).

// Build the system prompt with the live custom components appended. This is the
// one DB read each convert call makes — one extra read per AI action, by design
// (the old per-session prompt cache is gone with the session model).
async function buildSystemPrompt(): Promise<string> {
  const ds = await getDataSource();
  const customs = await ds.getRepository(CustomComponent).find();
  const componentList = customs
    .map((c) => {
      const def = c.definition as Record<string, unknown>;
      return `- \`components/${c.namespace}/${c.type}\` — ${def?.htmlType ?? "unknown"} (${def?.label ?? "no label"})`;
    })
    .join("\n");

  const basePrompt = getSystemPrompt();
  return componentList
    ? `${basePrompt}\n\n## Live Custom Components (from database)\n${componentList}`
    : basePrompt;
}

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
// State lives in an in-memory Map keyed by jobId. The form_builder_api runs a
// single ECS task in sandbox/staging, so no cross-task coordination is needed.
// Unlike the PDF path (which can re-derive from Textract's 7-day result), an
// edit job is pure Bedrock with no external anchor — if the task restarts
// mid-edit the in-flight job is lost and the next poll 404s, which the client
// surfaces as "that was interrupted — try again". State is ephemeral; the sweep
// below caps memory.
type EditState =
  | { kind: "running"; startedAt: number }
  | { kind: "done"; result: RecipeResponse; finishedAt: number }
  | { kind: "failed"; reason: string; finishedAt: number };

const editStateByJobId = new Map<string, EditState>();

// Sweep entries older than 1 hour, every 5 minutes. Mirrors ai-upload.ts.
const ONE_HOUR_MS = 60 * 60 * 1000;
const SWEEP_INTERVAL_MS = 5 * 60 * 1000;
setInterval(() => {
  const cutoff = Date.now() - ONE_HOUR_MS;
  for (const [k, v] of editStateByJobId) {
    const ts = "startedAt" in v ? v.startedAt : v.finishedAt;
    if (ts < cutoff) editStateByJobId.delete(k);
  }
}, SWEEP_INTERVAL_MS).unref(); // unref so the interval doesn't keep the process alive

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
    editStateByJobId.set(jobId, {
      kind: "done",
      result,
      finishedAt: Date.now(),
    });
  } catch (err) {
    editStateByJobId.set(jobId, {
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
  try {
    if (!(await isAvailable())) {
      res.status(503).json({ error: "AI service not configured" });
      return;
    }

    const { message, recipeJson } = req.body ?? {};
    if (!message && !recipeJson) {
      res.status(400).json({
        error: "Provide at least one of message, recipeJson",
      });
      return;
    }

    const jobId = randomUUID();
    editStateByJobId.set(jobId, { kind: "running", startedAt: Date.now() });
    // Fire-and-forget. runEditBedrock catches its own errors into the map.
    void runEditBedrock(jobId, message, recipeJson);
    res.json({ jobId });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}

// GET /builder/ai/edit/status/:jobId — { status: "generating" | "done" |
// "failed", … }. An unknown id (expired/swept, or lost to a restart) → 404.
export function statusEditHandler(req: Request, res: Response): void {
  const jobId = req.params.jobId;
  const state =
    typeof jobId === "string" ? editStateByJobId.get(jobId) : undefined;

  if (!state) {
    res
      .status(404)
      .json({ error: "This edit session expired — please try again." });
    return;
  }
  if (state.kind === "running") {
    res.json({ status: "generating" });
    return;
  }
  if (state.kind === "done") {
    res.json({ status: "done", ...state.result });
    return;
  }
  res.json({ status: "failed", reason: state.reason });
}

aiRouter.post("/edit/start", startEditHandler);
aiRouter.get("/edit/status/:jobId", statusEditHandler);

// Extracts the page-fields object from a content reply: the first fenced JSON
// block that parses to a plain object. Unlike recipes there are no required
// keys — the model proposes only the fields it changed.
export function extractContentPage(
  text: string,
): Record<string, unknown> | null {
  const codeBlockMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (!codeBlockMatch) return null;
  try {
    const parsed = JSON.parse(codeBlockMatch[1]);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // Not valid JSON in code block
  }
  return null;
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
  try {
    if (!(await isAvailable())) {
      res.status(503).json({ error: "AI service not configured" });
      return;
    }

    const { message, pageJson } = req.body ?? {};
    if (!message || typeof message !== "string" || !message.trim()) {
      res.status(400).json({ error: "Provide a message" });
      return;
    }

    const userText = pageJson
      ? `Here is the current page as JSON:\n\n\`\`\`json\n${pageJson}\n\`\`\`\n\n${message.trim()}`
      : message.trim();

    const reply = await chat(getContentSystemPrompt(), [
      { role: "user", content: userText },
    ]);
    const page = extractContentPage(reply);

    res.json({ page, reply });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}
aiRouter.post("/content", contentHandler);

aiRouter.post("/upload/presign", presignHandler);
aiRouter.post("/upload/process", processHandler);
aiRouter.get("/upload/status/:jobId", statusHandler);
