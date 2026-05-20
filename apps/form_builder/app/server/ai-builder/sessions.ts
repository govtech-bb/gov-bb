import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { CustomComponent, FormDefinitionEntity } from "@govtech-bb/database";
import { getDataSource } from "../db";
import {
  buildSystemPromptFor,
  chat,
  ensureInitialised,
  isAvailable,
} from "./ai-client";
import { extractRecipe } from "./recipe-extractor";
import { buildSql } from "./sql-builder";
import { create, get, getOrThrow } from "./session-store";
import type { PublishResponse, SessionResponse } from "./types";

const sessionIdSchema = z.object({ sessionId: z.string() });

export const getAiStatus = createServerFn({ method: "GET" }).handler(
  async () => {
    await ensureInitialised();
    const available = await isAvailable();
    return {
      available,
      message: available
        ? "AI service is ready"
        : "AI service not configured. Set ANTHROPIC_API_KEY in environment.",
    };
  },
);

export const createSession = createServerFn({ method: "POST" })
  .inputValidator(z.object({ name: z.string().optional() }))
  .handler(async ({ data }): Promise<SessionResponse> => {
    const session = create(data?.name);
    const ds = await getDataSource();
    const customs = await ds.getRepository(CustomComponent).find();
    const componentList = customs
      .map((c) => {
        const def = c.definition as Record<string, unknown>;
        return `- \`components/${c.namespace}/${c.type}\` — ${def?.htmlType ?? "unknown"} (${def?.label ?? "no label"})`;
      })
      .join("\n");
    session.systemPrompt = await buildSystemPromptFor(componentList);
    return { sessionId: session.id, messages: [], recipe: null };
  });

export const sendMessage = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      sessionId: z.string(),
      message: z.string().min(1),
      pdfBase64: z.string().optional(),
    }),
  )
  .handler(async ({ data }): Promise<SessionResponse> => {
    if (!(await isAvailable())) {
      throw new Error("AI service not configured. Set ANTHROPIC_API_KEY.");
    }
    const session = getOrThrow(data.sessionId);
    if (data.pdfBase64 && !session.pdfPages) {
      session.pdfPages = [data.pdfBase64];
    }
    session.messages.push({ role: "user", content: data.message });
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

    return {
      sessionId: session.id,
      messages: session.messages,
      recipe: session.recipe,
    };
  });

export const getSession = createServerFn({ method: "GET" })
  .inputValidator(sessionIdSchema)
  .handler(async ({ data }): Promise<SessionResponse> => {
    const session = get(data.sessionId);
    if (!session) throw new Error("Session not found");
    return {
      sessionId: session.id,
      messages: session.messages,
      recipe: session.recipe,
    };
  });

export const getRecipe = createServerFn({ method: "GET" })
  .inputValidator(sessionIdSchema)
  .handler(async ({ data }) => {
    const session = get(data.sessionId);
    if (!session?.recipe) throw new Error("No recipe generated yet");
    return { recipe: session.recipe };
  });

export const extractRecipeFromSession = createServerFn({ method: "POST" })
  .inputValidator(sessionIdSchema)
  .handler(async ({ data }) => {
    const session = getOrThrow(data.sessionId);
    for (let i = session.messages.length - 1; i >= 0; i--) {
      if (session.messages[i].role === "assistant") {
        const recipe = extractRecipe(session.messages[i].content);
        if (recipe) {
          session.recipe = recipe;
          return { recipe };
        }
      }
    }
    throw new Error(
      "Could not find a valid recipe in the conversation. The AI must output JSON with formId and steps fields.",
    );
  });

export const getSql = createServerFn({ method: "GET" })
  .inputValidator(sessionIdSchema)
  .handler(async ({ data }) => {
    const session = get(data.sessionId);
    if (!session?.recipe) throw new Error("No recipe generated yet");
    const recipe = session.recipe as Record<string, any> & { formId?: string };
    const formId = recipe.formId ?? "unnamed-form";
    return { sql: buildSql(formId, recipe) };
  });

export const publishSession = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({ sessionId: z.string(), formId: z.string().optional() }),
  )
  .handler(async ({ data }): Promise<PublishResponse> => {
    const session = getOrThrow(data.sessionId);
    if (!session.recipe) {
      throw new Error("No recipe generated yet. Continue the conversation.");
    }
    const recipe = session.recipe as any;
    const formId = data.formId ?? recipe.formId;
    if (!formId) {
      throw new Error("Recipe has no formId. Provide one via the request.");
    }
    if (!recipe.formId || !recipe.steps || !Array.isArray(recipe.steps)) {
      throw new Error("Recipe must have formId and steps array.");
    }
    for (let i = 0; i < recipe.steps.length; i++) {
      const step = recipe.steps[i];
      if (
        !step.stepId ||
        !step.title ||
        !step.elements ||
        !Array.isArray(step.elements)
      ) {
        throw new Error(
          `Step ${i} must have stepId, title, and elements array.`,
        );
      }
      for (let j = 0; j < step.elements.length; j++) {
        const el = step.elements[j];
        if (
          !el.ref ||
          (!el.ref.startsWith("components/") && !el.ref.startsWith("blocks/"))
        ) {
          throw new Error(
            `Step "${step.stepId}" element ${j}: ref must start with "components/" or "blocks/" (got "${el.ref}").`,
          );
        }
        if (el.ref.startsWith("components/") && !el.overrides?.fieldId) {
          throw new Error(
            `Step "${step.stepId}" element ${j} (ref: ${el.ref}): missing fieldId in overrides.`,
          );
        }
      }
    }
    if (!recipe.createdAt || !recipe.updatedAt || !recipe.version) {
      throw new Error(
        "Recipe must have createdAt, updatedAt, and version fields.",
      );
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
    return {
      formId,
      message: `Form "${formId}" published successfully.`,
      sql,
      previewUrl: `https://app-sandbox.alpha.gov.bb/forms/${formId}`,
    };
  });

export const deletePublished = createServerFn({ method: "POST" })
  .inputValidator(sessionIdSchema)
  .handler(async ({ data }) => {
    const session = getOrThrow(data.sessionId);
    if (!session.publishedFormId) {
      throw new Error("No form has been published in this session.");
    }
    const ds = await getDataSource();
    await ds
      .getRepository(FormDefinitionEntity)
      .delete({ formId: session.publishedFormId });
    const deletedFormId = session.publishedFormId;
    session.publishedFormId = undefined;
    return { message: `Form "${deletedFormId}" deleted successfully.` };
  });
