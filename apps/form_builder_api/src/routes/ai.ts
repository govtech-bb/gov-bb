import { Router } from "express";
import { randomUUID } from "node:crypto";
import { CustomComponent, FormDefinitionEntity } from "@govtech-bb/database";
import { getDataSource } from "../db.js";
import { getSystemPrompt } from "../ai/system-prompt.js";
import { chat, ensureInitialised, isAvailable } from "../ai/client.js";
import { extractRecipe } from "../ai/recipe-extractor.js";
import { buildSql } from "../ai/sql-builder.js";

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

const sessions = new Map<string, Session>();

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

    const session: Session = { id, name, messages: [], recipe: null, systemPrompt };
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
  res.json({ sessionId: session.id, messages: session.messages, recipe: session.recipe });
});

// POST /builder/ai/sessions/:id/message
aiRouter.post("/sessions/:id/message", async (req, res) => {
  try {
    if (!(await isAvailable())) {
      res.status(503).json({ error: "AI service not configured" });
      return;
    }
    const session = sessions.get(req.params.id);
    if (!session) {
      res.status(404).json({ error: "Session not found" });
      return;
    }

    const { message, pdfBase64 } = req.body;
    if (!message) {
      res.status(400).json({ error: "message is required" });
      return;
    }

    if (pdfBase64 && !session.pdfPages) {
      session.pdfPages = [pdfBase64];
    }

    session.messages.push({ role: "user", content: message });
    const assistantText = await chat(session.systemPrompt, session.messages, session.pdfPages);
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

    res.json({ sessionId: session.id, messages: session.messages, recipe: session.recipe });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

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
    await ds.getRepository(FormDefinitionEntity).delete({ formId: session.publishedFormId });
    const deleted = session.publishedFormId;
    session.publishedFormId = undefined;
    res.json({ message: `Form "${deleted}" deleted.` });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
