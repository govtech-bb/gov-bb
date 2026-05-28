import { Router, type Request, type Response } from "express";
import { randomUUID } from "node:crypto";
import { CustomComponent, FormDefinitionEntity } from "@govtech-bb/database";
import { findRecipeIdCollisionsFromRecipe } from "@govtech-bb/form-builder";
import type { ServiceContractRecipe } from "@govtech-bb/form-types";
import { getDataSource } from "../db.js";
import { getFullCatalog } from "../catalog.js";
import { getSystemPrompt } from "../ai/system-prompt.js";
import { chat, ensureInitialised, isAvailable } from "../ai/client.js";
import { extractRecipe } from "../ai/recipe-extractor.js";
import { buildSql } from "../ai/sql-builder.js";
import { fetchObjectAsBase64, presignPutObject } from "../ai/s3.js";

export const aiRouter = Router();

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface Session {
  id: string;
  name: string;
  messages: ChatMessage[];
  recipe: Record<string, any> | null;
  systemPrompt: string;
  pdfPages?: string[];
  publishedFormId?: string;
}

// Module-private. Exposed via test helpers below for spec coverage of routes
// that depend on session state (presigned-upload, /message s3Key branch).
const sessions = new Map<string, Session>();

// Max PDF size accepted via the presigned-upload flow. Matches Bedrock's PDF
// document input ceiling and the SSR client-side guard.
const MAX_UPLOAD_BYTES = 32 * 1024 * 1024;
const ALLOWED_UPLOAD_CONTENT_TYPES = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
]);

function sanitizeFilename(name: string): string {
  return name
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9._-]/g, "")
    .slice(0, 120);
}

function buildAiUploadKey(sessionId: string, filename: string): string {
  return `ai-uploads/${sessionId}/${randomUUID()}-${sanitizeFilename(filename)}`;
}

// Test-only helpers (not part of the public API surface).
export const __aiTestHooks = {
  putSession(session: Session): void {
    sessions.set(session.id, session);
  },
  getSession(id: string): Session | undefined {
    return sessions.get(id);
  },
  clear(): void {
    sessions.clear();
  },
};

// GET /builder/ai/status
aiRouter.get("/status", async (_req, res) => {
  const available = await isAvailable();
  res.json({
    available,
    message: available ? "AI service is ready" : "AI service not configured",
  });
});

// POST /builder/ai/sessions — create a new session
aiRouter.post("/sessions", async (req, res) => {
  try {
    const name = req.body.name ?? "New form";
    const id = randomUUID();

    const ds = await getDataSource();
    const customs = await ds.getRepository(CustomComponent).find();
    const componentList = customs
      .map((c) => {
        const def = c.definition as Record<string, unknown>;
        return `- \`components/${c.namespace}/${c.type}\` — ${def?.htmlType ?? "unknown"} (${def?.label ?? "no label"})`;
      })
      .join("\n");

    const basePrompt = getSystemPrompt();
    const systemPrompt = componentList
      ? `${basePrompt}\n\n## Live Custom Components (from database)\n${componentList}`
      : basePrompt;

    const session: Session = {
      id,
      name,
      messages: [],
      recipe: null,
      systemPrompt,
    };
    sessions.set(id, session);

    res.status(201).json({ sessionId: id, messages: [], recipe: null });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /builder/ai/sessions/:id
aiRouter.get("/sessions/:id", (req, res) => {
  const session = sessions.get(req.params.id);
  if (!session) {
    res.status(404).json({ error: "Session not found" });
    return;
  }
  res.json({
    sessionId: session.id,
    messages: session.messages,
    recipe: session.recipe,
  });
});

// POST /builder/ai/presigned-upload — issue a one-shot S3 PUT URL so the SSR
// client can stream PDFs straight to S3, bypassing the Amplify Lambda's ~6MB
// request body cap that broke the previous base64-in-body flow (413).
//
// The returned s3Key is scoped to the supplied sessionId so /message's s3Key
// branch can reject cross-session keys.
export async function presignedUploadHandler(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const { sessionId, filename, contentType, size } = req.body ?? {};
    if (typeof sessionId !== "string" || !sessions.has(sessionId)) {
      res.status(404).json({ error: "Session not found" });
      return;
    }
    if (typeof filename !== "string" || !filename.trim()) {
      res.status(400).json({ error: "filename is required" });
      return;
    }
    if (
      typeof contentType !== "string" ||
      !ALLOWED_UPLOAD_CONTENT_TYPES.has(contentType)
    ) {
      res.status(400).json({
        error: "contentType must be application/pdf, image/png, or image/jpeg",
      });
      return;
    }
    if (
      typeof size !== "number" ||
      !Number.isFinite(size) ||
      size <= 0 ||
      size > MAX_UPLOAD_BYTES
    ) {
      res
        .status(400)
        .json({
          error: `size must be a positive integer <= ${MAX_UPLOAD_BYTES}`,
        });
      return;
    }

    const s3Key = buildAiUploadKey(sessionId, filename);
    const uploadUrl = await presignPutObject({
      key: s3Key,
      contentType,
      contentLength: size,
    });
    res.json({ uploadUrl, s3Key });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}
aiRouter.post("/presigned-upload", presignedUploadHandler);

// POST /builder/ai/sessions/:id/message
//
// Accepts either `pdfBase64` (legacy, inline) or `s3Key` (new, fetched server-
// side from the uploads bucket). Both paths funnel into `session.pdfPages` so
// the chat() pipeline stays unchanged. Keeping `pdfBase64` for the deploy
// window where the SSR side hasn't shipped the presigned flow yet.
export async function sendMessageHandler(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    if (!(await isAvailable())) {
      res.status(503).json({ error: "AI service not configured" });
      return;
    }
    // Express 5 types req.params.<key> as `string | string[]`; the route
    // pattern `/sessions/:id` only ever yields a single string at runtime.
    const sessionId = String(req.params.id);
    const session = sessions.get(sessionId);
    if (!session) {
      res.status(404).json({ error: "Session not found" });
      return;
    }

    const { message, pdfBase64, s3Key } = req.body;
    if (!message) {
      res.status(400).json({ error: "message is required" });
      return;
    }

    if (s3Key && !session.pdfPages) {
      if (
        typeof s3Key !== "string" ||
        !s3Key.startsWith(`ai-uploads/${session.id}/`)
      ) {
        res
          .status(400)
          .json({ error: "s3Key does not belong to this session" });
        return;
      }
      const base64 = await fetchObjectAsBase64(s3Key);
      session.pdfPages = [base64];
    } else if (pdfBase64 && !session.pdfPages) {
      session.pdfPages = [pdfBase64];
    }

    session.messages.push({ role: "user", content: message });
    const assistantText = await chat(
      session.systemPrompt,
      session.messages,
      session.pdfPages,
    );
    session.messages.push({ role: "assistant", content: assistantText });

    let recipe = extractRecipe(assistantText);
    if (!recipe) {
      for (let i = session.messages.length - 1; i >= 0; i--) {
        if (session.messages[i].role === "assistant") {
          recipe = extractRecipe(session.messages[i].content);
          if (recipe) break;
        }
      }
    }
    if (recipe) session.recipe = recipe;

    res.json({
      sessionId: session.id,
      messages: session.messages,
      recipe: session.recipe,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}
aiRouter.post("/sessions/:id/message", sendMessageHandler);

// GET /builder/ai/sessions/:id/recipe
aiRouter.get("/sessions/:id/recipe", (req, res) => {
  const session = sessions.get(req.params.id);
  if (!session?.recipe) {
    res.status(404).json({ error: "No recipe generated yet" });
    return;
  }
  res.json({ recipe: session.recipe });
});

// POST /builder/ai/sessions/:id/extract
aiRouter.post("/sessions/:id/extract", (req, res) => {
  const session = sessions.get(req.params.id);
  if (!session) {
    res.status(404).json({ error: "Session not found" });
    return;
  }
  for (let i = session.messages.length - 1; i >= 0; i--) {
    if (session.messages[i].role === "assistant") {
      const recipe = extractRecipe(session.messages[i].content);
      if (recipe) {
        session.recipe = recipe;
        res.json({ recipe });
        return;
      }
    }
  }
  res.status(404).json({ error: "No valid recipe found in conversation" });
});

// GET /builder/ai/sessions/:id/sql
aiRouter.get("/sessions/:id/sql", (req, res) => {
  const session = sessions.get(req.params.id);
  if (!session?.recipe) {
    res.status(404).json({ error: "No recipe generated yet" });
    return;
  }
  const formId = (session.recipe as any).formId ?? "unnamed-form";
  res.json({ sql: buildSql(formId, session.recipe) });
});

// POST /builder/ai/sessions/:id/publish
aiRouter.post("/sessions/:id/publish", async (req, res) => {
  try {
    const session = sessions.get(req.params.id);
    if (!session) {
      res.status(404).json({ error: "Session not found" });
      return;
    }
    if (!session.recipe) {
      res.status(400).json({ error: "No recipe generated yet" });
      return;
    }
    const recipe = session.recipe as any;
    const formId = req.body.formId ?? recipe.formId;
    if (!formId) {
      res.status(400).json({ error: "No formId in recipe or request" });
      return;
    }

    // Backstop: reject duplicate resolved fieldIds/stepIds before persisting.
    // The AI builder's only other guard is a prompt instruction, and this
    // recipe is written straight to FormDefinitionEntity (read by the live
    // forms API), so a collision here would reach users. Uniqueness-only — not
    // a full Zod gate — since raw AI recipes may legitimately lack
    // createdAt/updatedAt/version (ADR 0010).
    const catalog = await getFullCatalog();
    const collisions = findRecipeIdCollisionsFromRecipe(
      recipe as ServiceContractRecipe,
      catalog,
    );
    if (
      collisions.fieldIdCollisions.length > 0 ||
      collisions.stepIdCollisions.length > 0
    ) {
      res.status(422).json({
        error:
          "Recipe has duplicate field or step IDs and was not published. Every resolved fieldId and stepId must be unique across the form.",
        collisions,
      });
      return;
    }

    const sql = buildSql(formId, recipe);
    const ds = await getDataSource();
    const repo = ds.getRepository(FormDefinitionEntity);

    if (session.publishedFormId) {
      await repo.delete({ formId: session.publishedFormId });
    }

    const entity = repo.create({
      formId,
      version: recipe.version ?? "1.0.0",
      schema: recipe,
      publishedAt: new Date(),
    });
    await repo.save(entity);
    session.publishedFormId = formId;

    res.json({
      formId,
      message: `Form "${formId}" published successfully.`,
      sql,
      previewUrl: `https://forms.sandbox.alpha.gov.bb/forms/${formId}`,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /builder/ai/sessions/:id/delete
aiRouter.post("/sessions/:id/delete", async (req, res) => {
  try {
    const session = sessions.get(req.params.id);
    if (!session) {
      res.status(404).json({ error: "Session not found" });
      return;
    }
    if (!session.publishedFormId) {
      res.status(400).json({ error: "No form published in this session" });
      return;
    }
    const ds = await getDataSource();
    await ds
      .getRepository(FormDefinitionEntity)
      .delete({ formId: session.publishedFormId });
    const deleted = session.publishedFormId;
    session.publishedFormId = undefined;
    res.json({ message: `Form "${deleted}" deleted.` });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
